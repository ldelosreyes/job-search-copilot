import { z } from "zod";
import { applicationSourceSchema } from "./application";

// ~5,000 char cap per the Phase 4 spec's Guardrails — rejected before
// ever reaching the LLM.
export const jdParseRequestSchema = z.object({
  jdText: z.string().min(1).max(5_000),
});

export type JdParseRequest = z.infer<typeof jdParseRequestSchema>;

export const jdParseResultSchema = z.object({
  company: z.string(),
  roleTitle: z.string(),
  salaryMin: z.number().int().nonnegative().nullable(),
  salaryMax: z.number().int().nonnegative().nullable(),
  source: applicationSourceSchema,
});

export type JdParseResult = z.infer<typeof jdParseResultSchema>;

/**
 * Plain JSON Schema passed to callChatModel for structured output — not
 * derived from the Zod schema above (this project has no
 * Zod-to-JSON-Schema dependency, and one small hand-written schema is
 * simpler than adding one). The Zod schema above is still what actually
 * validates the LLM's response before it ever reaches the client; this
 * is a hint to the model, not the source of truth.
 */
export const jdParseJsonSchema = {
  name: "jd_parse_result",
  schema: {
    type: "object",
    properties: {
      company: { type: "string" },
      roleTitle: { type: "string" },
      salaryMin: { type: ["number", "null"] },
      salaryMax: { type: ["number", "null"] },
      source: {
        type: "string",
        enum: ["recruiter", "direct", "referral", "job_board", "other"],
      },
    },
    required: ["company", "roleTitle", "salaryMin", "salaryMax", "source"],
    additionalProperties: false,
  },
};
