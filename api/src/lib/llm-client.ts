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

// Built lazily, not at module scope: index.ts imports jd-parse/fit-score
// unconditionally, so an eager requireEnv() here used to throw at *app
// import time* — crashing every route, including /health, whenever
// CEREBRAS_API_KEY/GROQ_API_KEY were unset (they are on this project's
// Vercel preview deployments). Deferring construction to first actual
// use means only requests that hit an LLM route need these keys.
// maxRetries: 0 on both — the SDK's own default retry-on-429/5xx would
// otherwise retry against the *same* provider 2-3 times before ever
// raising the error for callChatModel's own fallback to see, burning
// quota and latency against a provider that just said "no" instead of
// falling through to the other one immediately.
let cerebras: Provider | undefined;
function getCerebras(): Provider {
  return (cerebras ??= {
    name: "Cerebras",
    client: new OpenAI({
      baseURL: "https://api.cerebras.ai/v1",
      apiKey: requireEnv("CEREBRAS_API_KEY"),
      maxRetries: 0,
    }),
    model: "gpt-oss-120b",
  });
}

let groq: Provider | undefined;
function getGroq(): Provider {
  // Groq's model catalog namespaces this one differently than Cerebras
  // does, despite being the same underlying weights.
  return (groq ??= {
    name: "Groq",
    client: new OpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: requireEnv("GROQ_API_KEY"),
      maxRetries: 0,
    }),
    model: "openai/gpt-oss-120b",
  });
}

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
  maxTokens: number,
): Promise<unknown> {
  const response = await provider.client.chat.completions.create({
    model: provider.model,
    messages,
    max_tokens: maxTokens,
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

/**
 * maxTokens bounds worst-case per-call cost/latency regardless of input
 * (see Guardrails in the Phase 4 spec) — callers size this to what
 * their own response shape actually needs (a few short fields vs. a
 * per-application rationale array), not a single global constant.
 */
export async function callChatModel(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  schema: JsonSchemaSpec,
  maxTokens: number,
): Promise<unknown> {
  try {
    return await complete(getCerebras(), messages, schema, maxTokens);
  } catch (error) {
    if (!isRetryable(error)) {
      throw error;
    }
    console.warn(
      `Cerebras call failed (${error instanceof Error ? error.message : String(error)}), falling back to Groq.`,
    );
    return complete(getGroq(), messages, schema, maxTokens);
  }
}
