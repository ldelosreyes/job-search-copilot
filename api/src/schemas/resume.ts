import { z } from "zod";

/**
 * GET /resume's response — deliberately never includes the extracted
 * text, only enough for the UI to show "current resume: X, updated Y"
 * or an empty state. The text itself only ever leaves the server as
 * input to an LLM call (/fit-score, /fit-score-all), never as a
 * response body of its own.
 */
export const resumeStatusSchema = z.object({
  filename: z.string().nullable(),
  updatedAt: z.string().datetime().nullable(),
});

export type ResumeStatus = z.infer<typeof resumeStatusSchema>;
