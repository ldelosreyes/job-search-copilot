import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { applicationsRoute } from "./routes/applications";

// Vercel gives every preview deployment and branch alias its own unique
// origin (e.g. job-search-copilot-web-sandbox-<hash>-<team>.vercel.app),
// so a single exact-match WEB_ORIGIN can't cover them all. Instead, allow
// WEB_ORIGIN exactly (local dev, explicit override) plus anything in the
// web-sandbox project's own Vercel domain family — not arbitrary origins.
const sandboxWebOriginPattern =
  /^https:\/\/job-search-copilot-web-sandbox(-[\w-]+)?\.vercel\.app$/;

const app = new Hono()
  .use(logger())
  .use(
    "/*",
    cors({
      origin: (origin) => {
        const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
        if (origin === webOrigin) return origin;
        if (origin && sandboxWebOriginPattern.test(origin)) return origin;
        return undefined;
      },
    }),
  )
  .get("/health", (c) => c.json({ status: "ok" }))
  .route("/applications", applicationsRoute);

// Exporting the app's type lets the web package use Hono's RPC client
// (hc<AppType>) for fully type-checked fetch calls — request bodies,
// params, and response shapes are all inferred from these route
// definitions, with zero manually-written API client types to drift
// out of sync with the server.
export type AppType = typeof app;

// Exported so deploy-target-specific entrypoints (Bun below, Vercel in
// api/index.ts) can wrap the same app instance rather than duplicating
// route definitions per platform.
export { app };

export default {
  port: process.env.PORT ?? 3001,
  fetch: app.fetch,
};
