import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Application } from "../schemas/application";
import { computeFitScoreFingerprint } from "../lib/fit-score-fingerprint";

// Scoped to the new POST /:id/fit-score route only — the rest of this
// file's CRUD routes (GET/POST/PATCH/DELETE /applications) have no unit
// tests yet, a pre-existing gap, not introduced by this change.

process.env.CEREBRAS_API_KEY ??= "test-cerebras-key";
process.env.GROQ_API_KEY ??= "test-groq-key";

const RESUME_UPDATED_AT = "2026-01-01T00:00:00.000Z";

const callChatModelMock = mock(async () => ({}) as unknown);
const getResumeContentMock = mock(async () => ({ ok: true as const, value: null as string | null }));
const getResumeStatusMock = mock(async () => ({
  ok: true as const,
  value: { filename: null as string | null, updatedAt: null as string | null },
}));
const getApplicationMock = mock(async () => ({ ok: true as const, value: null as Application | null }));
const setFitScoreMock = mock(async () => ({ ok: true as const, value: null as Application | null }));

mock.module("../lib/llm-client", () => ({
  callChatModel: callChatModelMock,
}));

mock.module("../db/resume-repo", () => ({
  getResumeContent: getResumeContentMock,
  getResumeStatus: getResumeStatusMock,
}));

mock.module("../db/applications-repo", () => ({
  listApplications: mock(async () => ({ ok: true, value: [] })),
  getApplication: getApplicationMock,
  createApplication: mock(async () => ({ ok: true, value: null })),
  updateApplication: mock(async () => ({ ok: true, value: null })),
  deleteApplication: mock(async () => ({ ok: true, value: false })),
  setFitScore: setFitScoreMock,
}));

const { applicationsRoute } = await import("./applications");

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

const ID_A = "11111111-1111-1111-1111-111111111111";

function scoreFit(id: string) {
  return applicationsRoute.request(`/${id}/fit-score`, { method: "POST" });
}

describe("POST /applications/:id/fit-score", () => {
  beforeEach(() => {
    callChatModelMock.mockClear();
    getResumeContentMock.mockClear();
    getResumeStatusMock.mockClear();
    getApplicationMock.mockClear();
    setFitScoreMock.mockClear();
    getResumeContentMock.mockResolvedValue({ ok: true, value: "Some resume text." });
    getResumeStatusMock.mockResolvedValue({
      ok: true,
      value: { filename: "resume.pdf", updatedAt: RESUME_UPDATED_AT },
    });
  });

  test("returns 404 when the application doesn't exist", async () => {
    getApplicationMock.mockResolvedValueOnce({ ok: true, value: null });

    const res = await scoreFit(ID_A);

    expect(res.status).toBe(404);
    expect(callChatModelMock).not.toHaveBeenCalled();
  });

  test("returns 422 when the application has no JD", async () => {
    getApplicationMock.mockResolvedValueOnce({ ok: true, value: makeApplication({ id: ID_A, jdText: null }) });

    const res = await scoreFit(ID_A);

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "This application has no JD to score against" });
    expect(callChatModelMock).not.toHaveBeenCalled();
  });

  test("returns 422 when no resume has been uploaded", async () => {
    getApplicationMock.mockResolvedValueOnce({ ok: true, value: makeApplication({ id: ID_A }) });
    getResumeContentMock.mockResolvedValueOnce({ ok: true, value: null });
    getResumeStatusMock.mockResolvedValueOnce({ ok: true, value: { filename: null, updatedAt: null } });

    const res = await scoreFit(ID_A);

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Upload a resume to check fit" });
    expect(callChatModelMock).not.toHaveBeenCalled();
  });

  test("scores, persists via setFitScore with the correct fingerprint, and returns the updated application", async () => {
    const application = makeApplication({ id: ID_A });
    getApplicationMock.mockResolvedValueOnce({ ok: true, value: application });
    callChatModelMock.mockResolvedValueOnce({ score: 82, rationale: "Strong overlap." });
    const updated = { ...application, fitScore: 82, fitRationale: "Strong overlap." };
    setFitScoreMock.mockResolvedValueOnce({ ok: true, value: updated });

    const res = await scoreFit(ID_A);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(setFitScoreMock).toHaveBeenCalledWith(
      ID_A,
      82,
      "Strong overlap.",
      computeFitScoreFingerprint(application.jdText!, application.roleTitle, RESUME_UPDATED_AT),
    );
  });

  test("returns 502 when both providers fail", async () => {
    getApplicationMock.mockResolvedValueOnce({ ok: true, value: makeApplication({ id: ID_A }) });
    callChatModelMock.mockRejectedValueOnce(new Error("both providers failed"));

    const res = await scoreFit(ID_A);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "AI demo temporarily unavailable, try again shortly" });
  });

  test("returns 502 when the LLM response doesn't match the expected shape", async () => {
    getApplicationMock.mockResolvedValueOnce({ ok: true, value: makeApplication({ id: ID_A }) });
    callChatModelMock.mockResolvedValueOnce({ unexpected: "shape" });

    const res = await scoreFit(ID_A);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "AI response was invalid, try again" });
  });
});
