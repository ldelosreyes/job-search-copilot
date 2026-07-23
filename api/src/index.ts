import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { applicationsRoute } from "./routes/applications";

const app = new Hono()
  .use(logger())
  .use(
    "/*",
    cors({
      origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
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
