import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { applicationsRoute } from "./routes/applications";
import { requireAuth } from "./middleware/auth";
import { requireApiToken } from "./middleware/api-token";

// Vercel gives every preview deployment and branch alias its own unique
// origin (e.g. job-search-copilot-web-sandbox-<hash>-ldelosreyes-se.vercel.app),
// so a single exact-match WEB_ORIGIN can't cover them all. Anchored on the
// actual Vercel team slug (ldelosreyes-se), not just the project name
// prefix — team slugs are globally unique and assigned by Vercel based on
// real account ownership, so an unrelated project (e.g. someone else
// registering "job-search-copilot-web-sandbox-phishing" under their own
// account) can't produce a domain ending in our team's slug.
const sandboxWebOriginPattern =
  /^https:\/\/job-search-copilot-web-sandbox(\.vercel\.app|-[\w-]+-ldelosreyes-se\.vercel\.app)$/;

// requireApiToken (static shared secret) and requireAuth (Supabase JWT)
// both read the same Authorization header, but no single token can
// satisfy both a string-equality check and a valid-JWT check at once —
// enabling both would make every request 401, with no obvious reason
// why. Fail fast at startup instead of leaving that to be discovered
// via a confusing "everything is broken" deploy.
if (process.env.API_TOKEN && process.env.AUTH_ENABLED === "true") {
  throw new Error(
    "API_TOKEN and AUTH_ENABLED=true are both set — these are mutually " +
      "exclusive gates (sandbox vs. production), not layers to combine.",
  );
}

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
  .use("/applications/*", requireApiToken)
  .use("/applications/*", requireAuth)
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
