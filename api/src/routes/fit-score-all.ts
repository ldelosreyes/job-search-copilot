import { Hono } from "hono";
import { callChatModel } from "../lib/llm-client.js";
import { getResumeContent, getResumeStatus } from "../db/resume-repo.js";
import { listApplications, setFitScore } from "../db/applications-repo.js";
import { computeFitScoreFingerprint } from "../lib/fit-score-fingerprint.js";
import { fitScoreAllJsonSchema, fitScoreAllLlmResponseSchema } from "../schemas/fit-score-all.js";
import {
  FIT_SCORE_ALL_JD_TEXT_CAP_CHARS,
  FIT_SCORE_ALL_MAX_APPLICATIONS,
  FIT_SCORE_ALL_MAX_TOKENS,
  RESUME_TEXT_MAX_CHARS,
} from "../lib/ai-limits.js";

const SYSTEM_PROMPT =
  "Score how well this resume fits each of the listed job applications, " +
  "0-100 each, with a short, specific rationale (2-3 sentences) naming " +
  "concrete overlaps and gaps. Return exactly one result per application " +
  "id given, using that same set of ids.";

export const fitScoreAllRoute = new Hono().post("/", async (c) => {
  const [resumeContentResult, resumeStatusResult] = await Promise.all([
    getResumeContent(),
    getResumeStatus(),
  ]);
  if (!resumeContentResult.ok || !resumeStatusResult.ok) {
    return c.json({ error: "Failed to fetch resume" }, 500);
  }
  if (!resumeContentResult.value || !resumeStatusResult.value.updatedAt) {
    return c.json({ error: "Upload a resume to check fit" }, 422);
  }
  const resumeUpdatedAt = resumeStatusResult.value.updatedAt;

  const applicationsResult = await listApplications();
  if (!applicationsResult.ok) {
    return c.json({ error: "Failed to fetch applications" }, 500);
  }

  const withJd = applicationsResult.value.filter((application) => application.jdText !== null);
  const noJdCount = applicationsResult.value.length - withJd.length;

  // Skip applications whose cached score was already computed against
  // the exact same jdText/roleTitle/resume — re-scoring them would just
  // burn LLM budget on an unchanged answer.
  const stale = withJd.filter((application) => {
    const currentFingerprint = computeFitScoreFingerprint(
      application.jdText!,
      application.roleTitle,
      resumeUpdatedAt,
    );
    return application.fitScoreFingerprint !== currentFingerprint;
  });

  const toScore = stale.slice(0, FIT_SCORE_ALL_MAX_APPLICATIONS);
  const overCapCount = Math.max(0, stale.length - FIT_SCORE_ALL_MAX_APPLICATIONS);
  const skippedCount = noJdCount + overCapCount;

  if (toScore.length === 0) {
    return c.json({ scoredCount: 0, skippedCount });
  }

  const applicationsBlock = toScore
    .map(
      (application) =>
        `ID: ${application.id}\nCompany: ${application.company}\nRole: ${application.roleTitle}\n` +
        `JD:\n${(application.jdText ?? "").slice(0, FIT_SCORE_ALL_JD_TEXT_CAP_CHARS)}`,
    )
    .join("\n\n---\n\n");

  let raw: unknown;
  try {
    raw = await callChatModel(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `RESUME:\n${resumeContentResult.value.slice(0, RESUME_TEXT_MAX_CHARS)}\n\nAPPLICATIONS:\n${applicationsBlock}`,
        },
      ],
      fitScoreAllJsonSchema,
      FIT_SCORE_ALL_MAX_TOKENS,
    );
  } catch {
    return c.json({ error: "AI demo temporarily unavailable, try again shortly" }, 502);
  }

  const parsed = fitScoreAllLlmResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "AI response was invalid, try again" }, 502);
  }

  const toScoreById = new Map(toScore.map((application) => [application.id, application]));
  const resultIds = parsed.data.results.map((result) => result.applicationId);
  const idsMatch =
    resultIds.length === toScore.length && resultIds.every((id) => toScoreById.has(id));

  if (!idsMatch) {
    return c.json({ error: "AI response was invalid, try again" }, 502);
  }

  for (const result of parsed.data.results) {
    const application = toScoreById.get(result.applicationId)!;
    const fingerprint = computeFitScoreFingerprint(
      application.jdText!,
      application.roleTitle,
      resumeUpdatedAt,
    );
    await setFitScore(result.applicationId, result.score, result.rationale, fingerprint);
  }

  return c.json({ scoredCount: parsed.data.results.length, skippedCount });
});
