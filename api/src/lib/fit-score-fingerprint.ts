import { createHash } from "node:crypto";

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
