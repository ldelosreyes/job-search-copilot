import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.CEREBRAS_API_KEY ??= "test-cerebras-key";
process.env.GROQ_API_KEY ??= "test-groq-key";

const callChatModelMock = mock(async () => ({}) as unknown);

mock.module("../lib/llm-client", () => ({
  callChatModel: callChatModelMock,
}));

const { jdParseRoute } = await import("./jd-parse");

function post(body: unknown) {
  return jdParseRoute.request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /jd-parse", () => {
  beforeEach(() => {
    callChatModelMock.mockClear();
  });

  test("returns the parsed fields on a valid LLM response", async () => {
    callChatModelMock.mockResolvedValueOnce({
      company: "Acme Co",
      roleTitle: "Staff Engineer",
      salaryMin: 150_000,
      salaryMax: 190_000,
      source: "job_board",
    });

    const res = await post({ jdText: "Staff Engineer at Acme Co, $150k-$190k." });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      company: "Acme Co",
      roleTitle: "Staff Engineer",
      salaryMin: 150_000,
      salaryMax: 190_000,
      source: "job_board",
    });
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
