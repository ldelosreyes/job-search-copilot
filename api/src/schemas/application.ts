import { z } from "zod";

/**
 * Application status modeled as a discriminated union, not a flat string enum.
 *
 * Why this matters (and why it's worth explaining in an interview):
 * each stage of a job application carries genuinely different data —
 * an "interview" has a round number, a "rejected" has a reason, an
 * "offer" has an amount and a deadline. A flat `status: string` field
 * would force every one of those fields to be optional on every row,
 * and nothing would stop you from constructing a "rejected" application
 * with an `offerAmount` set. Modeling it as a discriminated union on
 * `stage` means TypeScript narrows the type for you: once you check
 * `application.status.stage === "offer"`, TypeScript knows
 * `application.status.offerAmount` exists — no optional chaining,
 * no runtime guessing.
 */
const appliedStatus = z.object({
  stage: z.literal("applied"),
  appliedAt: z.string().datetime(),
});

const screeningStatus = z.object({
  stage: z.literal("screening"),
  screeningCallAt: z.string().datetime().optional(),
});

const interviewStatus = z.object({
  stage: z.literal("interview"),
  interviewRound: z.number().int().positive(),
  interviewAt: z.string().datetime().optional(),
});

const offerStatus = z.object({
  stage: z.literal("offer"),
  offerAmount: z.number().positive().optional(),
  offerDeadline: z.string().datetime().optional(),
});

const rejectedStatus = z.object({
  stage: z.literal("rejected"),
  reason: z.string().optional(),
  rejectedAt: z.string().datetime(),
});

const withdrawnStatus = z.object({
  stage: z.literal("withdrawn"),
  reason: z.string().optional(),
});

export const applicationStatusSchema = z.discriminatedUnion("stage", [
  appliedStatus,
  screeningStatus,
  interviewStatus,
  offerStatus,
  rejectedStatus,
  withdrawnStatus,
]);

export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

/** Source of the lead — matters for your own tracking (e.g. recruiter vs. direct). */
export const applicationSourceSchema = z.enum([
  "recruiter",
  "direct",
  "referral",
  "job_board",
  "other",
]);

export type ApplicationSource = z.infer<typeof applicationSourceSchema>;

/** Full row shape as stored in Postgres. */
export const applicationSchema = z.object({
  id: z.string().uuid(),
  company: z.string().min(1).max(200),
  roleTitle: z.string().min(1).max(200),
  source: applicationSourceSchema,
  salaryMin: z.number().int().nonnegative().nullable(),
  salaryMax: z.number().int().nonnegative().nullable(),
  jdText: z.string().nullable(),
  notes: z.string().nullable(),
  status: applicationStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Application = z.infer<typeof applicationSchema>;

/** Payload accepted when creating a new application — server assigns id/timestamps. */
export const createApplicationSchema = applicationSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

/** Payload accepted when updating — every field optional, but if present must be valid. */
export const updateApplicationSchema = createApplicationSchema.partial();

export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
