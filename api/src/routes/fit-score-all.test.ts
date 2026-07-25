import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Application } from "../schemas/application";

process.env.CEREBRAS_API_KEY ??= "test-cerebras-key";
process.env.GROQ_API_KEY ??= "test-groq-key";

const callChatModelMock = mock(async () => ({}) as unknown);
const getResumeContentMock = mock(async () => ({ ok: true as const, value: null as string | null }));
const listApplicationsMock = mock(async () => ({ ok: true as const, value: [] as Application[] }));

mock.module("../lib/llm-client", () => ({
  callChatModel: callChatModelMock,
}));

mock.module("../db/resume-repo", () => ({
  getResumeContent: getResumeContentMock,
}));

mock.module("../db/applications-repo", () => ({
  listApplications: listApplicationsMock,
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
    listApplicationsMock.mockClear();
    getResumeContentMock.mockResolvedValue({ ok: true, value: "Some resume text." });
    listApplicationsMock.mockResolvedValue({ ok: true, value: [] });
  });

  test("returns 422 when no resume has been uploaded", async () => {
    getResumeContentMock.mockResolvedValueOnce({ ok: true, value: null });

    const res = await post();

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Upload a resume to check fit" });
    expect(callChatModelMock).not.toHaveBeenCalled();
  });

  test("returns empty results without calling the LLM when no application has a jdText", async () => {
    listApplicationsMock.mockResolvedValueOnce({
      ok: true,
      value: [makeApplication({ id: ID_A, jdText: null })],
    });

    const res = await post();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [], consideredCount: 0, skippedCount: 1 });
    expect(callChatModelMock).not.toHaveBeenCalled();
  });

  test("scores applications and sorts results by score descending", async () => {
    listApplicationsMock.mockResolvedValueOnce({
      ok: true,
      value: [makeApplication({ id: ID_A }), makeApplication({ id: ID_B })],
    });
    callChatModelMock.mockResolvedValueOnce({
      results: [
        { applicationId: ID_A, score: 40, rationale: "Weak overlap." },
        { applicationId: ID_B, score: 90, rationale: "Strong overlap." },
      ],
    });

    const res = await post();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [
        { applicationId: ID_B, score: 90, rationale: "Strong overlap." },
        { applicationId: ID_A, score: 40, rationale: "Weak overlap." },
      ],
      consideredCount: 2,
      skippedCount: 0,
    });
  });

  test("caps at 25 applications and reports the rest as skipped", async () => {
    const withJd = Array.from({ length: 27 }, (_, i) =>
      makeApplication({ id: `33333333-3333-3333-3333-3333333333${String(i).padStart(2, "0")}` }),
    );
    const withoutJd = [makeApplication({ id: ID_A, jdText: null })];
    listApplicationsMock.mockResolvedValueOnce({ ok: true, value: [...withJd, ...withoutJd] });
    callChatModelMock.mockResolvedValueOnce({
      results: withJd.slice(0, 25).map((application) => ({
        applicationId: application.id,
        score: 50,
        rationale: "Some overlap.",
      })),
    });

    const res = await post();
    const body = (await res.json()) as { consideredCount: number; skippedCount: number };

    expect(res.status).toBe(200);
    expect(body.consideredCount).toBe(25);
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
