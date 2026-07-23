# Job Search Copilot

A small, real tool for tracking my own job applications while I search for an
AI Engineer role — built to demonstrate current React 19 + TypeScript depth
and a stack overlap with a specific job description (React 19, TanStack,
Tailwind v4, shadcn/ui, Hono on Bun, Postgres/Supabase, Vercel).

See [`PLANNING.md`](./PLANNING.md) for the scoping decisions made before any
code was written, and why several stack items commonly seen together
(Trigger.dev, Langfuse, TanStack Router) were deliberately left out of v1.

## Architecture

```
job-search-copilot/
├── api/            Hono on Bun — typed REST API, Zod validation, Postgres
│   ├── src/
│   │   ├── schemas/     Zod schemas (discriminated-union application status)
│   │   ├── db/          Postgres client + repository (postgres.js)
│   │   ├── routes/      Hono route handlers
│   │   └── index.ts     App entrypoint, exports AppType for the RPC client
│   ├── api/index.ts     Vercel serverless adapter (hono/vercel)
│   └── supabase/
│       └── migrations/  SQL schema
└── web/            React 19 + Vite — TanStack Query, Tailwind v4, shadcn/ui
    └── src/
        ├── lib/api-client.ts   Hono RPC client, typed against api's AppType
        ├── hooks/               TanStack Query hooks
        └── components/
```

**Why a typed RPC client instead of a hand-written fetch wrapper:**
`web/src/lib/api-client.ts` imports `AppType` — the *type* of the Hono app,
not any implementation — from the `api` package. Hono's `hc<AppType>()`
uses that to give every route call full type inference: request bodies,
URL params, and response shapes are all checked at compile time. If a route
on the server changes shape, the frontend fails to typecheck instead of
failing silently at runtime. This is the same category of guarantee
tRPC/GraphQL codegen give you, without a separate schema or build step.

**Why status is a discriminated union, not a status string:**
See the comment block in `api/src/schemas/application.ts`. Short version:
different stages carry genuinely different data (an interview has a round
number, an offer has an amount), and a flat string status would force every
field to be optional everywhere. `StageEditor.tsx` on the frontend renders
different form fields per stage using the exact same union, so the type
constrains the UI as well as the API.

## Local setup

Requires [Bun](https://bun.sh) 1.x.

```bash
bun install

# api/.env  (copy from api/.env.example)
DATABASE_URL=<your Supabase Postgres connection string>

# Run the SQL in api/supabase/migrations/0001_applications.sql against
# that database (via the Supabase SQL editor, or psql).

bun run dev:api   # http://localhost:3001
bun run dev:web   # http://localhost:5173, proxies /api -> :3001
```

`bun run typecheck` and `bun run lint` at the repo root run both packages.

## Auth (toggleable, off by default)

The public sandbox deployment intentionally runs with **no auth at all**
— it's a demo with seeded fake data, nothing to protect. The API's
`requireAuth` middleware (`api/src/middleware/auth.ts`) verifies a
Supabase-issued access token on every `/applications/*` request, but only
when `AUTH_ENABLED=true`; left unset, it's a no-op and behavior is
unchanged from before this middleware existed.

Only the production (personal-use) environment sets `AUTH_ENABLED=true`,
along with `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Project Settings →
API — the anon/publishable key, not the service-role key; the middleware
only verifies a user's own token, no admin operations). The API's auth
state is logged at startup (`Auth: ENABLED`/`Auth: DISABLED`), so a
misconfigured deployment is visible in the logs rather than silently
running open.

**Planned next**: a matching frontend toggle (a login screen shown only
when enabled) — not yet built as of this API-side middleware.

## Deploying

This is a Bun workspace with **two independent Vercel projects** — a static
frontend and a serverless API — not one hybrid config. Trying to force both
into a single Vercel project's zero-config detection is fragile in a
monorepo, so each package is deployed separately:

**Frontend (`web/`):**
1. New Vercel project, **Root Directory: `web`**.
2. Framework preset: Vite. Build command/output are already set in
   `web/vercel.json`.
3. Environment variable `VITE_API_URL` pointing at the deployed API
   project's URL — `api-client.ts` reads this at build time, falling
   back to the `/api` dev-proxy path when unset.

**API (`api/`):**
1. New Vercel project, **Root Directory: `api`**. With this root, Vercel's
   zero-config detection finds `api/index.ts` (the `hono/vercel` adapter)
   as a serverless function automatically. `api/vercel.json` also sets
   `bunVersion: "1.x"` — the deployed function runs on Vercel's Bun
   runtime rather than Node.js, since the code relies on Bun-style module
   resolution (see `WALKTHROUGH.md` for why this matters).
2. Environment variable `DATABASE_URL` set to the Supabase connection
   string (use the pooled "Transaction mode" URI, not the direct
   connection, since serverless functions open/close connections per
   invocation).
3. Environment variable `WEB_ORIGIN` set to the deployed frontend's URL,
   for CORS. The API's CORS check also accepts any origin in the web
   project's own Vercel preview-domain family (see `api/src/index.ts`),
   since every preview deployment/branch gets a unique origin that a
   single exact-match value can't cover.

**If using Vercel's Git integration** (auto-deploy on push), set every
environment variable above for **both** the Production and Preview
environments, not just Production — a Preview deployment with no
`DATABASE_URL` crashes on its very first request, since nothing about a
missing env var is specific to one environment or the other.

Both projects should point at the same GitHub repo; Vercel's per-project
Root Directory setting is what keeps them from colliding.

## What's deliberately not in v1

See `PLANNING.md` for the full reasoning — short version: Trigger.dev,
Langfuse, TanStack Router, and AI/LLM features are scoped for a later phase,
not because they don't fit the stack, but because pulling all of them in
for a days-long proof-of-concept would trade depth for breadth.
