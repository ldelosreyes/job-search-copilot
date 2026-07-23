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

## Testing

```bash
bun run --cwd api test       # unit tests (bun:test) — Zod schema validation
bun run --cwd web test:e2e   # Playwright E2E — full CRUD flow via a real browser
```

E2E tests expect both dev servers already running (`bun run dev:api` +
`bun run dev:web`) — they don't manage server lifecycle themselves, the
same way you'd test manually. CI runs unit tests inside the existing
`typecheck-and-build` job, and E2E as its own parallel `e2e` job (its
own throwaway Postgres, migrated fresh and discarded at the end) —
see `.github/workflows/ci.yml`.

## Auth — two independent, mutually exclusive toggles

**`requireAuth` (`api/src/middleware/auth.ts`)** — real per-user auth for
the future production (personal-use) environment. Verifies a
Supabase-issued access token on every `/applications/*` request, but only
when `AUTH_ENABLED=true`; left unset, it's a no-op. When enabled, also
requires `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Project Settings → API
— the anon/publishable key, not the service-role key). A matching
frontend login screen is planned but not yet built.

**`requireApiToken` (`api/src/middleware/api-token.ts`)** — a much
lighter, static shared-secret Bearer token gate for the *sandbox*
specifically. The sandbox's frontend stays fully public with no login
screen at all, but this blocks casual/direct access to the raw API.
Toggled by `API_TOKEN` (unset = no-op); the frontend sends the matching
`VITE_API_TOKEN` automatically. Since the token ships in the public JS
bundle, this is obscurity against naive/direct access, not real security
— an accepted tradeoff given the sandbox only ever holds fake seeded
data.

**These two are mutually exclusive, not layers to combine** — setting
both `API_TOKEN` and `AUTH_ENABLED=true` together fails fast at startup
with a clear error, since no single token could satisfy both checks at
once. Each gate's resolved state is logged unconditionally at startup
(`Auth: ENABLED`/`DISABLED`, `API token gate: ENABLED`/`DISABLED`), so a
misconfigured deployment is visible in the logs rather than silently
wrong.

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
