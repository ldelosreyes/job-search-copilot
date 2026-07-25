import { Hono } from "hono";
import { callChatModel } from "../lib/llm-client.js";
import { getResumeContent } from "../db/resume-repo.js";
import { listApplications } from "../db/applications-repo.js";
import {
  fitScoreAllJsonSchema,
  fitScoreAllLlmResponseSchema,
} from "../schemas/fit-score-all.js";

// Bounds worst-case prompt size the same way jdText's 5,000-char cap does
// for a single JD — see the Phase 4 spec's Guardrails.
const MAX_APPLICATIONS = 25;
const JD_TEXT_CAP = 3_000;
// One call scores up to 25 applications instead of /fit-score's one, so
// this needs much more headroom than that route's 400 — 25 UUIDs plus
// rationales can approach 3,000 tokens on its own, leaving no margin.
const MAX_TOKENS = 4_000;

const SYSTEM_PROMPT =
  "Score how well this resume fits each of the listed job applications, " +
  "0-100 each, with a short, specific rationale (2-3 sentences) naming " +
  "concrete overlaps and gaps. Return exactly one result per application " +
  "id given, using that same set of ids.";

export const fitScoreAllRoute = new Hono().post("/", async (c) => {
  const resumeResult = await getResumeContent();
  if (!resumeResult.ok) {
    return c.json({ error: "Failed to fetch resume" }, 500);
  }
  if (!resumeResult.value) {
    return c.json({ error: "Upload a resume to check fit" }, 422);
  }

  const applicationsResult = await listApplications();
  if (!applicationsResult.ok) {
    return c.json({ error: "Failed to fetch applications" }, 500);
  }

  const withJd = applicationsResult.value.filter((application) => application.jdText !== null);
  const considered = withJd.slice(0, MAX_APPLICATIONS);
  const noJdCount = applicationsResult.value.length - withJd.length;
  const overCapCount = Math.max(0, withJd.length - MAX_APPLICATIONS);
  const skippedCount = noJdCount + overCapCount;

  if (considered.length === 0) {
    return c.json({ results: [], consideredCount: 0, skippedCount });
  }

  const applicationsBlock = considered
    .map(
      (application) =>
        `ID: ${application.id}\nCompany: ${application.company}\nRole: ${application.roleTitle}\n` +
        `JD:\n${(application.jdText ?? "").slice(0, JD_TEXT_CAP)}`,
    )
    .join("\n\n---\n\n");

  let raw: unknown;
  try {
    raw = await callChatModel(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `RESUME:\n${resumeResult.value.slice(0, 5_000)}\n\nAPPLICATIONS:\n${applicationsBlock}`,
        },
      ],
      fitScoreAllJsonSchema,
      MAX_TOKENS,
    );
  } catch {
    return c.json({ error: "AI demo temporarily unavailable, try again shortly" }, 502);
  }

  const parsed = fitScoreAllLlmResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "AI response was invalid, try again" }, 502);
  }

  const consideredIds = new Set(considered.map((application) => application.id));
  const resultIds = parsed.data.results.map((result) => result.applicationId);
  const idsMatch =
    resultIds.length === considered.length && resultIds.every((id) => consideredIds.has(id));

  if (!idsMatch) {
    return c.json({ error: "AI response was invalid, try again" }, 502);
  }

  const sorted = [...parsed.data.results].sort((a, b) => b.score - a.score);

  return c.json({ results: sorted, consideredCount: considered.length, skippedCount });
});
