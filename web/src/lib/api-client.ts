import { hc } from "hono/client";
import type { AppType } from "@job-search-copilot/api/src/index.ts";

/**
 * hc<AppType>() gives us a client where every route, param, and
 * response body is inferred directly from the Hono app definition
 * in api/src/index.ts. If a route changes shape on the server,
 * this breaks at compile time on the client — there's no separate
 * hand-maintained API contract to let drift out of sync.
 *
 * In dev, Vite's proxy (vite.config.ts) forwards /api/* to the Hono
 * server on :3001, so we call same-origin paths and avoid CORS
 * entirely during local development. Once deployed, there is no dev
 * proxy — VITE_API_URL must point at the deployed API's origin, and
 * the API's CORS config (WEB_ORIGIN) must allow this site's origin.
 *
 * VITE_API_TOKEN mirrors the API's requireApiToken middleware (see
 * api/src/middleware/api-token.ts) — a static shared-secret gate for
 * the sandbox environment, not real per-user auth. Sent unconditionally;
 * when unset, this header is simply absent, which is exactly what the
 * middleware expects when API_TOKEN isn't configured server-side either.
 */
export const apiClient = hc<AppType>(import.meta.env.VITE_API_URL ?? "/api", {
  headers: import.meta.env.VITE_API_TOKEN
    ? { Authorization: `Bearer ${import.meta.env.VITE_API_TOKEN}` }
    : {},
});
