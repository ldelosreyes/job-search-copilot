import OpenAI from "openai";

/**
 * Shared LLM call wrapper for all three AI routes (/jd-parse, /fit-score,
 * /fit-score-all — see
 * docs/superpowers/specs/2026-07-23-llm-integration-design.md). Tries
 * Cerebras first, falls back to Groq on a 429 or 5xx. Both providers
 * host the same gpt-oss-120b weights over an OpenAI-compatible API, so
 * this is a config swap (baseURL/key/model id) inside one function, not
 * a provider abstraction.
 *
 * Deliberately schema-agnostic about Zod: this returns the parsed JSON
 * as-is. Each caller re-validates the result against its own Zod schema
 * — this module only handles getting *a* JSON response out of the LLM,
 * not proving it matches any particular route's expected shape.
 */

function requireEnv(name: "CEREBRAS_API_KEY" | "GROQ_API_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env and fill in your API key.`);
  }
  return value;
}

interface Provider {
  name: string;
  client: OpenAI;
  model: string;
}

// Fail fast at startup (matches db/client.ts's DATABASE_URL check) rather
// than throwing mid-request on whichever request happens to arrive first.
// maxRetries: 0 on both — the SDK's own default retry-on-429/5xx would
// otherwise retry against the *same* provider 2-3 times before ever
// raising the error for callChatModel's own fallback to see, burning
// quota and latency against a provider that just said "no" instead of
// falling through to the other one immediately.
const cerebras: Provider = {
  name: "Cerebras",
  client: new OpenAI({
    baseURL: "https://api.cerebras.ai/v1",
    apiKey: requireEnv("CEREBRAS_API_KEY"),
    maxRetries: 0,
  }),
  model: "gpt-oss-120b",
};

const groq: Provider = {
  name: "Groq",
  client: new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: requireEnv("GROQ_API_KEY"),
    maxRetries: 0,
  }),
  // Groq's model catalog namespaces this one differently than Cerebras
  // does, despite being the same underlying weights.
  model: "openai/gpt-oss-120b",
};

export interface JsonSchemaSpec {
  name: string;
  schema: Record<string, unknown>;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    return error.status === 429 || (error.status !== undefined && error.status >= 500);
  }
  // Network-level failures (timeouts, DNS, connection reset) are also
  // worth falling through to the second provider for.
  return true;
}

async function complete(
  provider: Provider,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  schema: JsonSchemaSpec,
): Promise<unknown> {
  const response = await provider.client.chat.completions.create({
    model: provider.model,
    messages,
    response_format: {
      type: "json_schema",
      json_schema: { name: schema.name, strict: true, schema: schema.schema },
    },
  });

  const content = response.choices[0]?.message.content;
  if (!content) {
    throw new Error(`${provider.name} returned an empty response.`);
  }
  return JSON.parse(content);
}

export async function callChatModel(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  schema: JsonSchemaSpec,
): Promise<unknown> {
  try {
    return await complete(cerebras, messages, schema);
  } catch (error) {
    if (!isRetryable(error)) {
      throw error;
    }
    console.warn(
      `Cerebras call failed (${error instanceof Error ? error.message : String(error)}), falling back to Groq.`,
    );
    return complete(groq, messages, schema);
  }
}
