import { hc } from "hono/client";
import type { AppType } from "@job-search-copilot/api/src/index.ts";
import { authEnabled, supabase } from "./supabase-client";

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
 */
export const apiBaseUrl = import.meta.env.VITE_API_URL ?? "/api";

/**
 * Exported for the one request hc<AppType>() can't type-safely express —
 * PUT /resume's multipart file upload — so that raw fetch() call still
 * goes through the same base URL/auth as everything else.
 *
 * When auth is enabled, this reads the *current* Supabase session's
 * access token fresh on every call (matching api/src/middleware/
 * auth.ts's requireAuth, which verifies that same JWT) — a static
 * header captured once at module load would go stale the moment the
 * token refreshes or the user signs out. Falls back to the old static
 * VITE_API_TOKEN (requireApiToken's shared-secret gate) when auth is
 * disabled, which is simply absent when API_TOKEN isn't configured
 * server-side either — matching before this existed.
 */
export async function getApiHeaders(): Promise<Record<string, string>> {
  if (authEnabled && supabase) {
    const { data } = await supabase.auth.getSession();
    return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }
  return import.meta.env.VITE_API_TOKEN
    ? { Authorization: `Bearer ${import.meta.env.VITE_API_TOKEN}` }
    : {};
}

export const apiClient = hc<AppType>(apiBaseUrl, { headers: getApiHeaders });
