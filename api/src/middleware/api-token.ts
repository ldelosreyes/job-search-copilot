import { bearerAuth } from "hono/bearer-auth";
import { createMiddleware } from "hono/factory";

/**
 * Blocks direct API access with a static shared-secret Bearer token, but
 * only when API_TOKEN is set — unset (the default), this is a no-op.
 *
 * This is deliberately NOT the same mechanism as requireAuth (Supabase
 * Auth, for the future production environment) — it's a much lighter
 * gate for the sandbox specifically, where the frontend itself stays
 * fully public with no login screen, but random direct/bot access to
 * the raw API should be blocked. The token gets baked into the
 * frontend's public JS bundle (VITE_API_TOKEN) to send automatically,
 * so this is obscurity against casual/naive access, not real security
 * against someone determined enough to extract it from the bundle —
 * an acceptable tradeoff given the sandbox only ever holds fake seeded
 * data. Combining this with requireAuth on the same deployment isn't a
 * designed use case (a single Bearer token can't satisfy both a static
 * secret and a Supabase JWT at once).
 */
const apiToken = process.env.API_TOKEN;

console.log(`API token gate: ${apiToken ? "ENABLED" : "DISABLED"}`);

export const requireApiToken = apiToken
  ? bearerAuth({ token: apiToken })
  : createMiddleware(async (_c, next) => next());
