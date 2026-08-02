import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Application } from "../schemas/application";
import { computeFitScoreFingerprint } from "../lib/fit-score-fingerprint";
import { FIT_SCORE_ALL_MAX_APPLICATIONS } from "../lib/ai-limits";

// Scoped to GET / and POST /:id/fit-score — the rest of this file's CRUD
// routes (POST/PATCH/DELETE /applications) have no unit tests yet, a
// pre-existing gap, not introduced by this change.

process.env.CEREBRAS_API_KEY ??= "test-cerebras-key";
process.env.GROQ_API_KEY ??= "test-groq-key";

const RESUME_UPDATED_AT = "2026-01-01T00:00:00.000Z";

const callChatModelMock = mock(async () => ({}) as unknown);
const getResumeContentMock = mock(async () => ({ ok: true as const, value: null as string | null }));
const getResumeStatusMock = mock(async () => ({
  ok: true as const,
  value: { filename: null as string | null, updatedAt: null as string | null },
}));
const getResumeSnapshotMock = mock(async () => ({
  ok: true as const,
  value: null as { content: string; filename: string; updatedAt: string } | null,
}));
const getApplicationMock = mock(async () => ({ ok: true as const, value: null as Application | null }));
const listApplicationsMock = mock(async () => ({ ok: true as const, value: [] as Application[] }));
const setFitScoreMock = mock(
  async (): Promise<{ ok: true; value: Application | null }> => ({ ok: true, value: null }),
);

mock.module("../lib/llm-client", () => ({
  callChatModel: callChatModelMock,
}));

mock.module("../db/resume-repo", () => ({
  getResumeContent: getResumeContentMock,
  getResumeStatus: getResumeStatusMock,
  getResumeSnapshot: getResumeSnapshotMock,
}));

mock.module("../db/applications-repo", () => ({
  listApplications: listApplicationsMock,
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

describe("GET /applications", () => {
  beforeEach(() => {
    listApplicationsMock.mockClear();
    getResumeStatusMock.mockClear();
  });

  test("marks an application false when no resume has been uploaded", async () => {
    getResumeStatusMock.mockResolvedValueOnce({
      ok: true,
      value: { filename: null, updatedAt: null },
    });
    listApplicationsMock.mockResolvedValueOnce({
      ok: true,
      value: [makeApplication({ id: ID_A })],
    });

    const res = await applicationsRoute.request("/");

    expect(await res.json()).toEqual([{ ...makeApplication({ id: ID_A }), needsFitScore: false }]);
  });

  test("marks an application true when it has never been scored", async () => {
    getResumeStatusMock.mockResolvedValueOnce({
      ok: true,
      value: { filename: "resume.pdf", updatedAt: RESUME_UPDATED_AT },
    });
    listApplicationsMock.mockResolvedValueOnce({
      ok: true,
      value: [makeApplication({ id: ID_A, fitScoreFingerprint: null })],
    });

    const res = await applicationsRoute.request("/");

    const [application] = (await res.json()) as Array<Record<string, unknown>>;
    expect(application).toMatchObject({ needsFitScore: true });
  });

  test("marks an application false when its cached score's fingerprint still matches", async () => {
    const jdText = "We need a staff engineer.";
    const roleTitle = "Staff Engineer";
    getResumeStatusMock.mockResolvedValueOnce({
      ok: true,
      value: { filename: "resume.pdf", updatedAt: RESUME_UPDATED_AT },
    });
    listApplicationsMock.mockResolvedValueOnce({
      ok: true,
      value: [
        makeApplication({
          id: ID_A,
          jdText,
          roleTitle,
          fitScore: 82,
          fitScoreFingerprint: computeFitScoreFingerprint(jdText, roleTitle, RESUME_UPDATED_AT),
        }),
      ],
    });

    const res = await applicationsRoute.request("/");

    const [application] = (await res.json()) as Array<Record<string, unknown>>;
    expect(application).toMatchObject({ needsFitScore: false });
  });

  test("marks an application true when its JD changed since it was scored", async () => {
    getResumeStatusMock.mockResolvedValueOnce({
      ok: true,
      value: { filename: "resume.pdf", updatedAt: RESUME_UPDATED_AT },
    });
    listApplicationsMock.mockResolvedValueOnce({
      ok: true,
      value: [
        makeApplication({
          id: ID_A,
          jdText: "A brand new JD.",
          fitScore: 82,
          fitScoreFingerprint: computeFitScoreFingerprint(
            "The old JD.",
            "Staff Engineer",
            RESUME_UPDATED_AT,
          ),
        }),
      ],
    });

    const res = await applicationsRoute.request("/");

    const [application] = (await res.json()) as Array<Record<string, unknown>>;
    expect(application).toMatchObject({ needsFitScore: true });
  });

  test("marks an application true when the resume was replaced since it was scored", async () => {
    const jdText = "We need a staff engineer.";
    const roleTitle = "Staff Engineer";
    getResumeStatusMock.mockResolvedValueOnce({
      ok: true,
      value: { filename: "resume.pdf", updatedAt: "2026-02-01T00:00:00.000Z" },
    });
    listApplicationsMock.mockResolvedValueOnce({
      ok: true,
      value: [
        makeApplication({
          id: ID_A,
          jdText,
          roleTitle,
          fitScore: 82,
          fitScoreFingerprint: computeFitScoreFingerprint(jdText, roleTitle, RESUME_UPDATED_AT),
        }),
      ],
    });

    const res = await applicationsRoute.request("/");

    const [application] = (await res.json()) as Array<Record<string, unknown>>;
    expect(application).toMatchObject({ needsFitScore: true });
  });

  test("marks an application without a JD false, even if unscored", async () => {
    getResumeStatusMock.mockResolvedValueOnce({
      ok: true,
      value: { filename: "resume.pdf", updatedAt: RESUME_UPDATED_AT },
    });
    listApplicationsMock.mockResolvedValueOnce({
      ok: true,
      value: [makeApplication({ id: ID_A, jdText: null, fitScoreFingerprint: null })],
    });

    const res = await applicationsRoute.request("/");

    const [application] = (await res.json()) as Array<Record<string, unknown>>;
    expect(application).toMatchObject({ needsFitScore: false });
  });

  test("marks only the first FIT_SCORE_ALL_MAX_APPLICATIONS stale applications true — a bulk run won't touch the rest this round", async () => {
    getResumeStatusMock.mockResolvedValueOnce({
      ok: true,
      value: { filename: "resume.pdf", updatedAt: RESUME_UPDATED_AT },
    });
    const staleApplications = Array.from({ length: FIT_SCORE_ALL_MAX_APPLICATIONS + 1 }, (_, index) =>
      makeApplication({
        id: `11111111-1111-1111-1111-${String(index).padStart(12, "0")}`,
        fitScoreFingerprint: null,
      }),
    );
    listApplicationsMock.mockResolvedValueOnce({ ok: true, value: staleApplications });

    const res = await applicationsRoute.request("/");

    const applications = (await res.json()) as Array<Record<string, unknown>>;
    const withinCap = applications.slice(0, FIT_SCORE_ALL_MAX_APPLICATIONS);
    const overCap = applications.slice(FIT_SCORE_ALL_MAX_APPLICATIONS);
    expect(withinCap.every((application) => application.needsFitScore === true)).toBe(true);
    expect(overCap.every((application) => application.needsFitScore === false)).toBe(true);
  });
});

describe("POST /applications/:id/fit-score", () => {
  beforeEach(() => {
    callChatModelMock.mockClear();
    getResumeContentMock.mockClear();
    getResumeStatusMock.mockClear();
    getResumeSnapshotMock.mockClear();
    getApplicationMock.mockClear();
    setFitScoreMock.mockClear();
    getResumeContentMock.mockResolvedValue({ ok: true, value: "Some resume text." });
    getResumeStatusMock.mockResolvedValue({
      ok: true,
      value: { filename: "resume.pdf", updatedAt: RESUME_UPDATED_AT },
    });
    getResumeSnapshotMock.mockResolvedValue({
      ok: true,
      value: {
        content: "Some resume text.",
        filename: "resume.pdf",
        updatedAt: RESUME_UPDATED_AT,
      },
    });
    setFitScoreMock.mockResolvedValue({
      ok: true,
      value: makeApplication({ id: ID_A, fitScore: 82 }),
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
    getResumeSnapshotMock.mockResolvedValueOnce({ ok: true, value: null });

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
    expect(getResumeSnapshotMock).toHaveBeenCalledTimes(1);
    expect(setFitScoreMock).toHaveBeenCalledWith(
      ID_A,
      82,
      "Strong overlap.",
      computeFitScoreFingerprint(application.jdText!, application.roleTitle, RESUME_UPDATED_AT),
      RESUME_UPDATED_AT,
    );
  });

  test("returns 409 when the resume changes before the score can be saved", async () => {
    getApplicationMock.mockResolvedValueOnce({
      ok: true,
      value: makeApplication({ id: ID_A }),
    });
    callChatModelMock.mockResolvedValueOnce({ score: 82, rationale: "Strong overlap." });
    setFitScoreMock.mockResolvedValueOnce({ ok: true, value: null });

    const res = await scoreFit(ID_A);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "The application or resume changed while scoring, try again",
    });
  });

  test("returns 502 when both providers fail", async () => {
    getApplicationMock.mockResolvedValueOnce({ ok: true, value: makeApplication({ id: ID_A }) });
    callChatModelMock.mockRejectedValueOnce(new Error("both providers failed"));

    const res = await scoreFit(ID_A);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "AI providers are temporarily unavailable, try again shortly",
    });
  });

  test("returns 502 when the LLM response doesn't match the expected shape", async () => {
    getApplicationMock.mockResolvedValueOnce({ ok: true, value: makeApplication({ id: ID_A }) });
    callChatModelMock.mockResolvedValueOnce({ unexpected: "shape" });

    const res = await scoreFit(ID_A);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "AI response was invalid, try again" });
  });
});
