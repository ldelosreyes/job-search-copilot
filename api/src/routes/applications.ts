import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  createApplicationSchema,
  updateApplicationSchema,
} from "../schemas/application.js";
import {
  listApplications,
  getApplication,
  createApplication,
  updateApplication,
  deleteApplication,
  setFitScore,
} from "../db/applications-repo.js";
import { getResumeSnapshot } from "../db/resume-repo.js";
import { callChatModel } from "../lib/llm-client.js";
import { computeFitScoreFingerprint } from "../lib/fit-score-fingerprint.js";
import { fitScoreJsonSchema, fitScoreResultSchema } from "../schemas/fit-score.js";
import { FIT_SCORE_MAX_TOKENS, JD_TEXT_MAX_CHARS, RESUME_TEXT_MAX_CHARS } from "../lib/ai-limits.js";

const idParamSchema = z.object({ id: z.string().uuid() });

const FIT_SCORE_SYSTEM_PROMPT =
  "Score how well this resume fits this job description, 0-100, with a " +
  "short, specific rationale (2-3 sentences) naming concrete overlaps and gaps.";

export const applicationsRoute = new Hono()
  .get("/", async (c) => {
    const result = await listApplications();
    if (!result.ok) {
      return c.json({ error: "Failed to list applications" }, 500);
    }
    return c.json(result.value);
  })

  .get("/:id", zValidator("param", idParamSchema), async (c) => {
    const { id } = c.req.valid("param");
    const result = await getApplication(id);
    if (!result.ok) {
      return c.json({ error: "Failed to fetch application" }, 500);
    }
    if (!result.value) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(result.value);
  })

  // zValidator rejects malformed bodies before this handler ever runs —
  // e.g. status.stage = "offer" with no offerAmount type mismatch, or a
  // company field that's an empty string. c.req.valid("json") is fully
  // typed as CreateApplicationInput, no `as` casts needed.
  .post("/", zValidator("json", createApplicationSchema), async (c) => {
    const input = c.req.valid("json");
    const result = await createApplication(input);
    if (!result.ok) {
      return c.json({ error: "Failed to create application" }, 500);
    }
    return c.json(result.value, 201);
  })

  .patch(
    "/:id",
    zValidator("param", idParamSchema),
    zValidator("json", updateApplicationSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const result = await updateApplication(id, input);
      if (!result.ok) {
        return c.json({ error: "Failed to update application" }, 500);
      }
      if (!result.value) {
        return c.json({ error: "Not found" }, 404);
      }
      return c.json(result.value);
    },
  )

  // Scores one application against the current resume and persists the
  // result (fit_score/fit_rationale/fit_scored_at/fingerprint) — unlike
  // POST /fit-score (ad-hoc, used before an application even exists yet,
  // during the "Analyze with AI" creation flow), this one is for an
  // already-tracked application and caches its result for the batch
  // POST /fit-score-all endpoint to read back without re-scoring.
  .post("/:id/fit-score", zValidator("param", idParamSchema), async (c) => {
    const { id } = c.req.valid("param");

    const applicationResult = await getApplication(id);
    if (!applicationResult.ok) {
      return c.json({ error: "Failed to fetch application" }, 500);
    }
    if (!applicationResult.value) {
      return c.json({ error: "Not found" }, 404);
    }
    const application = applicationResult.value;
    if (!application.jdText) {
      return c.json({ error: "This application has no JD to score against" }, 422);
    }

    const resumeResult = await getResumeSnapshot();
    if (!resumeResult.ok) {
      return c.json({ error: "Failed to fetch resume" }, 500);
    }
    if (!resumeResult.value) {
      return c.json({ error: "Upload a resume to check fit" }, 422);
    }
    const resume = resumeResult.value;

    let raw: unknown;
    try {
      raw = await callChatModel(
        [
          { role: "system", content: FIT_SCORE_SYSTEM_PROMPT },
          {
            role: "user",
            // Unlike POST /fit-score's ad-hoc jdText (schema-capped
            // before this handler ever runs), an existing application's
            // stored jdText has no length cap of its own — truncate here
            // too, or a long-since-pasted JD blows the token budget on
            // every single-card score.
            content: `RESUME:\n${resume.content.slice(0, RESUME_TEXT_MAX_CHARS)}\n\nJOB DESCRIPTION:\n${application.jdText.slice(0, JD_TEXT_MAX_CHARS)}`,
          },
        ],
        fitScoreJsonSchema,
        FIT_SCORE_MAX_TOKENS,
      );
    } catch {
      return c.json({ error: "AI providers are temporarily unavailable, try again shortly" }, 502);
    }

    const parsed = fitScoreResultSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "AI response was invalid, try again" }, 502);
    }

    const fingerprint = computeFitScoreFingerprint(
      application.jdText,
      application.roleTitle,
      resume.updatedAt,
    );
    const updateResult = await setFitScore(
      id,
      parsed.data.score,
      parsed.data.rationale,
      fingerprint,
      resume.updatedAt,
    );
    if (!updateResult.ok) {
      return c.json({ error: "Failed to save fit score" }, 500);
    }
    if (!updateResult.value) {
      return c.json(
        { error: "The application or resume changed while scoring, try again" },
        409,
      );
    }
    return c.json(updateResult.value);
  })

  .delete("/:id", zValidator("param", idParamSchema), async (c) => {
    const { id } = c.req.valid("param");
    const result = await deleteApplication(id);
    if (!result.ok) {
      return c.json({ error: "Failed to delete application" }, 500);
    }
    if (!result.value) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.body(null, 204);
  });
