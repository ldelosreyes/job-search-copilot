import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { callChatModel } from "../lib/llm-client.js";
import { jdParseJsonSchema, jdParseRequestSchema, jdParseResultSchema } from "../schemas/jd-parse.js";

// A handful of short string/number fields — 500 tokens is generous
// headroom without leaving the cap effectively unbounded.
const MAX_TOKENS = 500;

const SYSTEM_PROMPT =
  'Extract structured fields from this job description. If the company name ' +
  'or role title isn\'t clearly stated, return an empty string for that ' +
  'field — never a placeholder like "Unknown" or "N/A". salaryMin/salaryMax ' +
  'should be null if no salary is mentioned. Guess the best-fitting source ' +
  'from the enum; default to "other" if there\'s no clear signal.';

export const jdParseRoute = new Hono().post(
  "/",
  zValidator("json", jdParseRequestSchema),
  async (c) => {
    const { jdText } = c.req.valid("json");

    let raw: unknown;
    try {
      raw = await callChatModel(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: jdText },
        ],
        jdParseJsonSchema,
        MAX_TOKENS,
      );
    } catch {
      // Both Cerebras and Groq failed (quota exhausted, 5xx, network
      // error) — see callChatModel's fallback logic.
      return c.json({ error: "AI providers are temporarily unavailable, try again shortly" }, 502);
    }

    // A response came back, but doesn't match the expected shape —
    // never trust the model's output blindly, even with structured
    // output constraining it at the API level.
    const parsed = jdParseResultSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "AI response was invalid, try again" }, 502);
    }

    return c.json(parsed.data);
  },
);
