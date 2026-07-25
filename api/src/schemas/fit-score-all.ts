import { z } from "zod";

export const fitScoreAllItemSchema = z.object({
  applicationId: z.string().uuid(),
  score: z.number().min(0).max(100),
  rationale: z.string(),
});

export type FitScoreAllItem = z.infer<typeof fitScoreAllItemSchema>;

// What the LLM itself returns — just the scored results. consideredCount/
// skippedCount are computed server-side from the actual applications
// query, never trusted from the model.
export const fitScoreAllLlmResponseSchema = z.object({
  results: z.array(fitScoreAllItemSchema),
});

export const fitScoreAllResponseSchema = z.object({
  results: z.array(fitScoreAllItemSchema),
  consideredCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
});

export type FitScoreAllResponse = z.infer<typeof fitScoreAllResponseSchema>;

export const fitScoreAllJsonSchema = {
  name: "fit_score_all_result",
  schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            applicationId: { type: "string" },
            score: { type: "number" },
            rationale: { type: "string" },
          },
          required: ["applicationId", "score", "rationale"],
          additionalProperties: false,
        },
      },
    },
    required: ["results"],
    additionalProperties: false,
  },
};
