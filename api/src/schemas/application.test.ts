import { describe, expect, test } from "bun:test";
import {
  applicationStatusSchema,
  createApplicationSchema,
  updateApplicationSchema,
} from "./application";

describe("applicationStatusSchema — discriminated union", () => {
  test("applied requires appliedAt", () => {
    const valid = applicationStatusSchema.safeParse({
      stage: "applied",
      appliedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(valid.success).toBe(true);

    const missing = applicationStatusSchema.safeParse({ stage: "applied" });
    expect(missing.success).toBe(false);
  });

  test("screening allows omitting the optional screeningCallAt", () => {
    const result = applicationStatusSchema.safeParse({ stage: "screening" });
    expect(result.success).toBe(true);
  });

  test("interview requires a positive integer interviewRound", () => {
    const valid = applicationStatusSchema.safeParse({
      stage: "interview",
      interviewRound: 2,
    });
    expect(valid.success).toBe(true);

    const missing = applicationStatusSchema.safeParse({ stage: "interview" });
    expect(missing.success).toBe(false);

    const negative = applicationStatusSchema.safeParse({
      stage: "interview",
      interviewRound: -1,
    });
    expect(negative.success).toBe(false);
  });

  test("offer allows omitting both optional fields", () => {
    const result = applicationStatusSchema.safeParse({ stage: "offer" });
    expect(result.success).toBe(true);
  });

  test("rejected requires rejectedAt but reason is optional", () => {
    const valid = applicationStatusSchema.safeParse({
      stage: "rejected",
      rejectedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(valid.success).toBe(true);

    const missing = applicationStatusSchema.safeParse({ stage: "rejected" });
    expect(missing.success).toBe(false);
  });

  test("withdrawn only requires the stage itself", () => {
    const result = applicationStatusSchema.safeParse({ stage: "withdrawn" });
    expect(result.success).toBe(true);
  });

  test("rejects a stage value outside the six known ones", () => {
    const result = applicationStatusSchema.safeParse({
      stage: "ghosted",
      appliedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  test("strips fields that don't belong to the matched stage, rather than erroring on them", () => {
    // This is why the API layer can't just trust a status object's shape
    // from client input — applications-repo.ts re-validates on the way
    // out of the DB too, not just on the way in.
    const result = applicationStatusSchema.safeParse({
      stage: "rejected",
      rejectedAt: "2026-01-01T00:00:00.000Z",
      offerAmount: 999_999, // belongs to "offer", not "rejected"
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("offerAmount" in result.data).toBe(false);
    }
  });
});

describe("createApplicationSchema / updateApplicationSchema", () => {
  const validCreate = {
    company: "Acme",
    roleTitle: "Engineer",
    source: "direct" as const,
    salaryMin: null,
    salaryMax: null,
    jdText: null,
    notes: null,
    status: { stage: "applied" as const, appliedAt: "2026-01-01T00:00:00.000Z" },
  };

  test("accepts a full valid payload with no id/timestamps", () => {
    const result = createApplicationSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
  });

  test("rejects an empty company", () => {
    const result = createApplicationSchema.safeParse({ ...validCreate, company: "" });
    expect(result.success).toBe(false);
  });

  test("rejects a source outside the known enum", () => {
    const result = createApplicationSchema.safeParse({ ...validCreate, source: "linkedin" });
    expect(result.success).toBe(false);
  });

  test("updateApplicationSchema allows a completely empty object (partial update)", () => {
    const result = updateApplicationSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test("updateApplicationSchema still validates fields that are present", () => {
    const result = updateApplicationSchema.safeParse({ company: "" });
    expect(result.success).toBe(false);
  });
});
