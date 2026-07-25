import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Application } from "../schemas/application";
import { computeFitScoreFingerprint } from "../lib/fit-score-fingerprint";

process.env.CEREBRAS_API_KEY ??= "test-cerebras-key";
process.env.GROQ_API_KEY ??= "test-groq-key";

const RESUME_UPDATED_AT = "2026-01-01T00:00:00.000Z";

const callChatModelMock = mock(async () => ({}) as unknown);
const getResumeContentMock = mock(async () => ({ ok: true as const, value: null as string | null }));
const getResumeStatusMock = mock(async () => ({
  ok: true as const,
  value: { filename: null as string | null, updatedAt: null as string | null },
}));
const listApplicationsMock = mock(async () => ({ ok: true as const, value: [] as Application[] }));
const setFitScoreMock = mock(async () => ({ ok: true as const, value: null }));

mock.module("../lib/llm-client", () => ({
  callChatModel: callChatModelMock,
}));

mock.module("../db/resume-repo", () => ({
  getResumeContent: getResumeContentMock,
  getResumeStatus: getResumeStatusMock,
}));

// bun:test's mock.module patches the module globally for the whole test
// run, not just this file — every export applications.ts imports from
// this module must be present here too, or another test file importing
// applications.ts (even one that never touches fit-score-all) can fail
// with "export not found" depending on file load order.
mock.module("../db/applications-repo", () => ({
  listApplications: listApplicationsMock,
  setFitScore: setFitScoreMock,
  getApplication: mock(async () => ({ ok: true, value: null })),
  createApplication: mock(async () => ({ ok: true, value: null })),
  updateApplication: mock(async () => ({ ok: true, value: null })),
  deleteApplication: mock(async () => ({ ok: true, value: false })),
}));

const { fitScoreAllRoute } = await import("./fit-score-all");

function makeApplication(overrides: Partial<Application> & Pick<Application, "id">): Application {
  return {
    company: "Acme Co",
    roleTitle: "Staff Engineer",
    source: "direct",
    salaryMin: null,
    salaryMax: null,
    jdText: "We need a staff engineer.",
    notes: null,
    status: { stage: "applied", appliedAt: "2026-01-01T00:00:00.000Z" },
    fitScore: null,
    fitRationale: null,
    fitScoredAt: null,
    fitScoreFingerprint: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function post() {
  return fitScoreAllRoute.request("/", { method: "POST" });
}

const ID_A = "11111111-1111-1111-1111-111111111111";
const ID_B = "22222222-2222-2222-2222-222222222222";

describe("POST /fit-score-all", () => {
  beforeEach(() => {
    callChatModelMock.mockClear();
    getResumeContentMock.mockClear();
    getResumeStatusMock.mockClear();
    listApplicationsMock.mockClear();
    setFitScoreMock.mockClear();
    getResumeContentMock.mockResolvedValue({ ok: true, value: "Some resume text." });
    getResumeStatusMock.mockResolvedValue({
      ok: true,
      value: { filename: "resume.pdf", updatedAt: RESUME_UPDATED_AT },
    });
    listApplicationsMock.mockResolvedValue({ ok: true, value: [] });
  });

  test("returns 422 when no resume has been uploaded", async () => {
    getResumeContentMock.mockResolvedValueOnce({ ok: true, value: null });
    getResumeStatusMock.mockResolvedValueOnce({ ok: true, value: { filename: null, updatedAt: null } });

    const res = await post();

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Upload a resume to check fit" });
    expect(callChatModelMock).not.toHaveBeenCalled();
  });

  test("returns scoredCount 0 without calling the LLM when no application has a jdText", async () => {
    listApplicationsMock.mockResolvedValueOnce({
      ok: true,
      value: [makeApplication({ id: ID_A, jdText: null })],
    });

    const res = await post();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scoredCount: 0, skippedCount: 1 });
    expect(callChatModelMock).not.toHaveBeenCalled();
  });

  test("skips an application whose cached score is still fresh, without calling the LLM", async () => {
    const freshFingerprint = computeFitScoreFingerprint(
      "We need a staff engineer.",
      "Staff Engineer",
      RESUME_UPDATED_AT,
    );
    listApplicationsMock.mockResolvedValueOnce({
      ok: true,
      value: [
        makeApplication({ id: ID_A, fitScore: 82, fitScoreFingerprint: freshFingerprint }),
      ],
    });

    const res = await post();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scoredCount: 0, skippedCount: 0 });
    expect(callChatModelMock).not.toHaveBeenCalled();
    expect(setFitScoreMock).not.toHaveBeenCalled();
  });

  test("re-scores an application whose JD/title changed since it was last scored", async () => {
    const staleFingerprint = computeFitScoreFingerprint(
      "An old, since-edited JD.",
      "Staff Engineer",
      RESUME_UPDATED_AT,
    );
    listApplicationsMock.mockResolvedValueOnce({
      ok: true,
      value: [makeApplication({ id: ID_A, fitScore: 40, fitScoreFingerprint: staleFingerprint })],
    });
    callChatModelMock.mockResolvedValueOnce({
      results: [{ applicationId: ID_A, score: 90, rationale: "Now a strong match." }],
    });

    const res = await post();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scoredCount: 1, skippedCount: 0 });
    expect(setFitScoreMock).toHaveBeenCalledWith(
      ID_A,
      90,
      "Now a strong match.",
      computeFitScoreFingerprint("We need a staff engineer.", "Staff Engineer", RESUME_UPDATED_AT),
    );
  });

  test("caps at 25 stale applications and reports the rest as skipped", async () => {
    const stale = Array.from({ length: 27 }, (_, i) =>
      makeApplication({ id: `33333333-3333-3333-3333-3333333333${String(i).padStart(2, "0")}` }),
    );
    const withoutJd = [makeApplication({ id: ID_A, jdText: null })];
    listApplicationsMock.mockResolvedValueOnce({ ok: true, value: [...stale, ...withoutJd] });
    callChatModelMock.mockResolvedValueOnce({
      results: stale.slice(0, 25).map((application) => ({
        applicationId: application.id,
        score: 50,
        rationale: "Some overlap.",
      })),
    });

    const res = await post();
    const body = (await res.json()) as { scoredCount: number; skippedCount: number };

    expect(res.status).toBe(200);
    expect(body.scoredCount).toBe(25);
    // 2 over the cap + 1 with no jdText.
    expect(body.skippedCount).toBe(3);
  });

  test("returns 502 when both providers fail", async () => {
    listApplicationsMock.mockResolvedValueOnce({ ok: true, value: [makeApplication({ id: ID_A })] });
    callChatModelMock.mockRejectedValueOnce(new Error("both providers failed"));

    const res = await post();

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "AI demo temporarily unavailable, try again shortly" });
  });

  test("returns 502 when the LLM response doesn't match the expected shape", async () => {
    listApplicationsMock.mockResolvedValueOnce({ ok: true, value: [makeApplication({ id: ID_A })] });
    callChatModelMock.mockResolvedValueOnce({ unexpected: "shape" });

    const res = await post();

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "AI response was invalid, try again" });
  });

  test("returns 502 when the LLM response's ids don't match the requested applications", async () => {
    listApplicationsMock.mockResolvedValueOnce({ ok: true, value: [makeApplication({ id: ID_A })] });
    callChatModelMock.mockResolvedValueOnce({
      results: [{ applicationId: ID_B, score: 50, rationale: "Wrong id." }],
    });

    const res = await post();

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "AI response was invalid, try again" });
  });
});
