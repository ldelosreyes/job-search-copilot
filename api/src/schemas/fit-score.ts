import { z } from "zod";

// Same ~5,000 char cap as /jd-parse's Guardrails.
export const fitScoreRequestSchema = z.object({
  jdText: z.string().min(1).max(5_000),
});

export type FitScoreRequest = z.infer<typeof fitScoreRequestSchema>;

export const fitScoreResultSchema = z.object({
  score: z.number().min(0).max(100),
  rationale: z.string(),
});

export type FitScoreResult = z.infer<typeof fitScoreResultSchema>;

/**
 * Plain JSON Schema for structured output — see jd-parse.ts for why
 * this isn't derived from the Zod schema above. The Zod schema is
 * still what actually validates the LLM's response server-side.
 */
export const fitScoreJsonSchema = {
  name: "fit_score_result",
  schema: {
    type: "object",
    properties: {
      score: { type: "number" },
      rationale: { type: "string" },
    },
    required: ["score", "rationale"],
    additionalProperties: false,
  },
};
