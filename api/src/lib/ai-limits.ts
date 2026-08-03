/**
 * Every size/token cap the AI routes use, overridable via env var so a
 * self-hosted deployment (with its own paid API keys, not this sandbox's
 * free-tier budget) can raise them without a code change. Defaults match
 * this project's original hardcoded values.
 *
 * FIT_SCORE_ALL_MAX_APPLICATIONS and FIT_SCORE_ALL_MAX_TOKENS are
 * coupled, not independent: more applications per batch call needs more
 * output tokens to describe them all, or the response truncates
 * mid-JSON and every call starts failing schema validation. Raise them
 * together.
 */
export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Applies to jdText everywhere it's accepted as AI-route input (POST
// /jd-parse, POST /fit-score) — the same cap both routes' Zod request
// schemas already needed independently.
export const JD_TEXT_MAX_CHARS = envInt("JD_TEXT_MAX_CHARS", 8_000);

// Resume text sliced to this length before going into any prompt —
// extracted PDF/DOCX text has no upper bound otherwise.
export const RESUME_TEXT_MAX_CHARS = envInt("RESUME_TEXT_MAX_CHARS", 5_000);

// Resume upload size cap, rejected before ever reaching the parsing
// libraries.
export const RESUME_MAX_BYTES = envInt("RESUME_MAX_BYTES", 2 * 1024 * 1024);

// Single-JD scoring (POST /fit-score, POST /applications/:id/fit-score)
// — one score + a short rationale.
export const FIT_SCORE_MAX_TOKENS = envInt("FIT_SCORE_MAX_TOKENS", 400);

// Batch scoring (POST /fit-score-all) — see the coupling note above.
export const FIT_SCORE_ALL_MAX_APPLICATIONS = envInt("FIT_SCORE_ALL_MAX_APPLICATIONS", 25);
export const FIT_SCORE_ALL_JD_TEXT_CAP_CHARS = envInt("FIT_SCORE_ALL_JD_TEXT_CAP_CHARS", 3_000);
export const FIT_SCORE_ALL_MAX_TOKENS = envInt("FIT_SCORE_ALL_MAX_TOKENS", 4_000);
