import { beforeEach, describe, expect, mock, test } from "bun:test";

// The module reads CEREBRAS_API_KEY/GROQ_API_KEY and constructs its two
// OpenAI clients at import time — each client captures `fetch` as it is
// *at construction time*, not looked up dynamically per-request. So the
// mock has to be installed on globalThis before the dynamic import runs;
// reassigning globalThis.fetch inside a test body is too late; each test
// instead swaps out `handler`, which the installed mock delegates to.
process.env.CEREBRAS_API_KEY = "test-cerebras-key";
process.env.GROQ_API_KEY = "test-groq-key";

let handler: (url: string) => Promise<Response> = async () => {
  throw new Error("no fetch handler configured for this test");
};

const fetchMock = mock((url: string | URL) => handler(url.toString()));
globalThis.fetch = fetchMock as unknown as typeof fetch;

const { callChatModel } = await import("./llm-client");

const schema = { name: "test_schema", schema: { type: "object", properties: {} } };
const messages = [{ role: "user" as const, content: "hello" }];

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function chatCompletion(content: unknown) {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 0,
    model: "test-model",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: JSON.stringify(content) },
        finish_reason: "stop",
      },
    ],
  };
}

beforeEach(() => {
  fetchMock.mockClear();
});

describe("callChatModel", () => {
  test("returns Cerebras' response directly when it succeeds", async () => {
    handler = async (url) => {
      expect(url).toContain("api.cerebras.ai");
      return jsonResponse(200, chatCompletion({ ok: true, provider: "cerebras" }));
    };

    const result = await callChatModel(messages, schema, 500);

    expect(result).toEqual({ ok: true, provider: "cerebras" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("falls back to Groq when Cerebras returns 429", async () => {
    handler = async (url) => {
      if (url.includes("api.cerebras.ai")) {
        return jsonResponse(429, { error: { message: "rate limited" } });
      }
      expect(url).toContain("api.groq.com");
      return jsonResponse(200, chatCompletion({ ok: true, provider: "groq" }));
    };

    const result = await callChatModel(messages, schema, 500);

    expect(result).toEqual({ ok: true, provider: "groq" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("throws when both Cerebras and Groq fail", async () => {
    handler = async () => jsonResponse(500, { error: { message: "down" } });

    await expect(callChatModel(messages, schema, 500)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("does not fall back on a non-retryable error (e.g. bad request)", async () => {
    handler = async () => jsonResponse(400, { error: { message: "bad request" } });

    await expect(callChatModel(messages, schema, 500)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
