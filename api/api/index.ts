import { handle } from "hono/vercel";
import { app } from "../src/index.ts";

/**
 * Locally we run src/index.ts directly under Bun (bun run --hot).
 * On Vercel, the same `app` instance is wrapped with hono/vercel's
 * handler and deployed as a serverless function — the route
 * definitions, validation, and DB access code are identical in both
 * places; only the runtime adapter differs.
 */
export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);

export const config = {
  runtime: "nodejs",
};
