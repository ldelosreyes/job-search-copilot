import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { callChatModel } from "../lib/llm-client.js";
import { getResumeContent } from "../db/resume-repo.js";
import { fitScoreJsonSchema, fitScoreRequestSchema, fitScoreResultSchema } from "../schemas/fit-score.js";

// A numeric score plus a short (2-3 sentence) rationale — more headroom
// than /jd-parse's handful of fields, but still a small, bounded reply.
const MAX_TOKENS = 400;

const SYSTEM_PROMPT =
  "Score how well this resume fits this job description, 0-100, with a " +
  "short, specific rationale (2-3 sentences) naming concrete overlaps and gaps.";

export const fitScoreRoute = new Hono().post(
  "/",
  zValidator("json", fitScoreRequestSchema),
  async (c) => {
    const { jdText } = c.req.valid("json");

    const resumeResult = await getResumeContent();
    if (!resumeResult.ok) {
      return c.json({ error: "Failed to fetch resume" }, 500);
    }
    if (!resumeResult.value) {
      return c.json({ error: "Upload a resume to check fit" }, 422);
    }

    let raw: unknown;
    try {
      raw = await callChatModel(
        [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            // Unlike jdText (schema-capped at 5,000), extracted resume text has
            // no upper bound — a large PDF/DOCX can blow the model's context.
            content: `RESUME:\n${resumeResult.value.slice(0, 5_000)}\n\nJOB DESCRIPTION:\n${jdText}`,
          },
        ],
        fitScoreJsonSchema,
        MAX_TOKENS,
      );
    } catch {
      return c.json({ error: "AI demo temporarily unavailable, try again shortly" }, 502);
    }

    const parsed = fitScoreResultSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "AI response was invalid, try again" }, 502);
    }

    return c.json(parsed.data);
  },
);
