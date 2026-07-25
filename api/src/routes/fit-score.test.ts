import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.CEREBRAS_API_KEY ??= "test-cerebras-key";
process.env.GROQ_API_KEY ??= "test-groq-key";

const callChatModelMock = mock(async () => ({}) as unknown);
const getResumeContentMock = mock(async () => ({ ok: true as const, value: null as string | null }));

mock.module("../lib/llm-client", () => ({
  callChatModel: callChatModelMock,
}));

// bun:test's mock.module patches the module globally for the whole test
// run, not just this file — every export another route imports from
// this module must be present here too (see applications.ts/
// fit-score-all.ts's getResumeStatus use), or a test file relying on it
// can fail with "export not found" depending on file load order.
mock.module("../db/resume-repo", () => ({
  getResumeContent: getResumeContentMock,
  getResumeStatus: mock(async () => ({ ok: true, value: { filename: null, updatedAt: null } })),
}));

const { fitScoreRoute } = await import("./fit-score");

function post(body: unknown) {
  return fitScoreRoute.request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /fit-score", () => {
  beforeEach(() => {
    callChatModelMock.mockClear();
    getResumeContentMock.mockClear();
    getResumeContentMock.mockResolvedValue({ ok: true, value: "Some resume text." });
  });

  test("returns a score and rationale on a valid LLM response", async () => {
    callChatModelMock.mockResolvedValueOnce({ score: 82, rationale: "Strong overlap in core skills." });

    const res = await post({ jdText: "Staff Engineer at Acme Co." });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ score: 82, rationale: "Strong overlap in core skills." });
  });

  test("returns 422 when no resume has been uploaded", async () => {
    getResumeContentMock.mockResolvedValueOnce({ ok: true, value: null });

    const res = await post({ jdText: "Staff Engineer at Acme Co." });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Upload a resume to check fit" });
    expect(callChatModelMock).not.toHaveBeenCalled();
  });

  test("rejects a blank jdText before ever calling the LLM", async () => {
    const res = await post({ jdText: "" });

    expect(res.status).toBe(400);
    expect(callChatModelMock).not.toHaveBeenCalled();
  });

  test("rejects a jdText over the 5,000 char cap before ever calling the LLM", async () => {
    const res = await post({ jdText: "a".repeat(5_001) });

    expect(res.status).toBe(400);
    expect(callChatModelMock).not.toHaveBeenCalled();
  });

  test("returns 502 when both providers fail", async () => {
    callChatModelMock.mockRejectedValueOnce(new Error("both providers failed"));

    const res = await post({ jdText: "Staff Engineer at Acme Co." });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "AI demo temporarily unavailable, try again shortly",
    });
  });

  test("returns 502 when the LLM response doesn't match the expected shape", async () => {
    callChatModelMock.mockResolvedValueOnce({ unexpected: "shape" });

    const res = await post({ jdText: "Staff Engineer at Acme Co." });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "AI response was invalid, try again" });
  });
});
