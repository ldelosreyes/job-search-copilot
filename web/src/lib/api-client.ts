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
 * entirely during local development.
 */
export const apiClient = hc<AppType>("/api");
