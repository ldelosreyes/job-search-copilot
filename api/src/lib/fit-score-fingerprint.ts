import { createHash } from "node:crypto";
import type { Application } from "../schemas/application.js";
import { FIT_SCORE_ALL_MAX_APPLICATIONS } from "./ai-limits.js";

/**
 * Identifies exactly what a cached fit score was computed against: the
 * JD text, the role title, and the resume's updatedAt. A mismatch
 * against a freshly computed fingerprint means at least one of those
 * three changed since the last score — a JD/title edit, or a resume
 * replacement — without needing a separate "stale" flag to keep in sync
 * by hand.
 */
export function computeFitScoreFingerprint(
  jdText: string,
  roleTitle: string,
  resumeUpdatedAt: string,
): string {
  // \0-separated so no combination of field values can ever collide
  // across the boundary between fields.
  return createHash("sha256").update(`${jdText}\0${roleTitle}\0${resumeUpdatedAt}`).digest("hex");
}

/**
 * True when a fresh fit score would differ from what's cached — no JD yet
 * means there's nothing to score, so that's not "needs scoring" either.
 */
export function needsFitScore(application: Application, resumeUpdatedAt: string): boolean {
  return (
    application.jdText !== null &&
    application.fitScoreFingerprint !==
      computeFitScoreFingerprint(application.jdText, application.roleTitle, resumeUpdatedAt)
  );
}

/**
 * Applications a bulk fit-score-all run will actually score this round, in
 * listApplications() order — stale ones capped at FIT_SCORE_ALL_MAX_APPLICATIONS,
 * since a single run never scores more than that. Shared so GET /applications
 * (needsFitScore per card) and POST /fit-score-all (toScore) can't drift apart
 * on which applications count as "will be touched."
 */
export function selectBulkScoreCandidates(
  applications: Application[],
  resumeUpdatedAt: string,
): Application[] {
  return applications
    .filter((application) => needsFitScore(application, resumeUpdatedAt))
    .slice(0, FIT_SCORE_ALL_MAX_APPLICATIONS);
}
