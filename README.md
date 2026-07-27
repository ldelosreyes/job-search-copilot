# Job Search Copilot

A small, real tool for tracking my own job applications while I search for an
AI Engineer role — built to demonstrate current React 19 + TypeScript depth
and a stack overlap with a specific job description (React 19, TanStack,
Tailwind v4, shadcn/ui, Hono on Bun, Postgres/Supabase, Vercel).

**[Live demo](https://job-search-copilot-web-sandbox.vercel.app)** — seeded
with fake sample applications, reset nightly. Gated behind a login screen
(`AUTH_ENABLED=true`, Supabase-issued credentials handed to a selected
audience — e.g. an employer ahead of an interview) rather than left fully
public;
see the Auth section below for how this toggle works and why.

See [`PLANNING.md`](./PLANNING.md) for the scoping decisions made before any
code was written, and why several stack items commonly seen together
(Trigger.dev, Langfuse, TanStack Router) were deliberately left out of v1.
See [`WALKTHROUGH.md`](./WALKTHROUGH.md) for how the code actually works,
function by function.

## Features

- **Application tracking** — create/edit/delete applications with a
  discriminated-union status (`applied`, `screening`, `interview`, `offer`,
  `rejected`, `withdrawn`); each stage's editor only shows the fields that
  make sense for it (interview round, offer amount, etc.).
- **Resume upload** (`ResumeAndScoreStrip`) — upload a PDF or DOCX resume;
  text is extracted server-side (`pdf-parse`/`mammoth`) and stored for
  fit-scoring. Replacing or removing the resume clears any cached fit
  scores, since they're no longer valid against a different resume.
- **AI-assisted JD analysis ("Analyze with AI")** — paste a job description
  into the New Application form and have an LLM extract company, role
  title, source, and salary range into the form fields in one call
  (`/jd-parse`).
- **Resume-fit scoring** — score a single application's JD text against the
  uploaded resume (`/fit-score`, per-card `FitScoreButton`), or score every
  eligible application at once (`/fit-score-all`), skipping ones already
  scored against the current resume/JD/title combination to avoid
  re-spending LLM budget on an unchanged answer. Scores and their
  rationale persist on the application row.
- **Optional per-user auth** for the sandbox demo, and a lightweight
  shared-secret gate as an alternative — see the Auth section below.

## Architecture

```
job-search-copilot/
├── api/            Hono on Bun — typed REST API, Zod validation, Postgres
│   ├── src/
│   │   ├── schemas/     Zod schemas: application (discriminated-union
│   │   │                status), resume, fit-score(-all), jd-parse
│   │   ├── db/          Postgres client + repositories (postgres.js):
│   │   │                applications, resume
│   │   ├── lib/         llm-client (Cerebras/Groq chat calls with
│   │   │                fallback), ai-limits, result (Result<T, E>),
│   │   │                extract-resume-text (pdf-parse/mammoth),
│   │   │                fit-score-fingerprint (skip-if-unchanged check)
│   │   ├── middleware/  auth.ts (Supabase per-user auth), api-token.ts
│   │   │                (shared-secret gate) — see Auth below
│   │   ├── routes/      applications, resume, jd-parse, fit-score,
│   │   │                fit-score-all
│   │   └── index.ts     App entrypoint, exports AppType for the RPC client
│   ├── api/index.ts     Vercel serverless adapter (hono/vercel)
│   └── supabase/
│       └── migrations/  SQL schema
└── web/            React 19 + Vite — TanStack Query, Tailwind v4, shadcn/ui
    └── src/
        ├── lib/api-client.ts    Hono RPC client, typed against api's AppType
        ├── lib/supabase-client.ts  Supabase client, gated by VITE_AUTH_ENABLED
        ├── hooks/                TanStack Query hooks (applications, resume,
        │                         fit-score, fit-score-all, analyze-with-ai,
        │                         session)
        └── components/           application-form/-list/-card (the stage
                                   editor lives inside application-card.tsx),
                                   ResumeAndScoreStrip, FitScoreButton,
                                   StatusBadge, LoginScreen
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
field to be optional everywhere. The stage editor inside
`application-card.tsx` renders different form fields per stage using the
exact same union, so the type constrains the UI as well as the API.

## Local setup

Requires [Bun](https://bun.sh) 1.x.

```bash
bun install

# api/.env  (copy from api/.env.example)
DATABASE_URL=<your Supabase Postgres connection string>

# Run every file in api/supabase/migrations/, in order, against that
# database (via the Supabase SQL editor, or psql) — currently 5 files,
# 0001 through 0005 (applications, resume, fit_score, enable_rls,
# remove_status_reason). Missing one isn't always obvious: the app boots
# fine and only the affected feature breaks (see the "resume table"
# incident in docs/deployment-journal.md).

bun run dev:api   # http://localhost:3001
bun run dev:web   # http://localhost:5173, proxies /api -> :3001
```

The JD-parsing and resume-fit-scoring features (`/jd-parse`, `/fit-score`,
`/fit-score-all`) need `CEREBRAS_API_KEY` and `GROQ_API_KEY` set in
`api/.env` — both are free-tier, no phone verification required
(cloud.cerebras.ai, console.groq.com). Without them, those three routes
return a clean "AI demo temporarily unavailable" response rather than
failing to start — every other route works regardless. See
`api/src/lib/llm-client.ts` and
[`docs/superpowers/specs/2026-07-23-llm-integration-design.md`](./docs/superpowers/specs/2026-07-23-llm-integration-design.md)
for the full design.

`bun run typecheck` and `bun run lint` at the repo root run both packages.

## Testing

```bash
bun run --cwd api test       # unit tests (bun:test) — Zod schemas, llm-client, ai-limits
bun run --cwd web test       # unit tests (Vitest) — forms, cards, resume strip, login screen
bun run --cwd web test:e2e   # Playwright E2E — full CRUD flow via a real browser
```

E2E tests expect both dev servers already running (`bun run dev:api` +
`bun run dev:web`) — they don't manage server lifecycle themselves, the
same way you'd test manually. CI splits this across two workflow files:
`.github/workflows/ci.yml` (typecheck, lint, `web` build, and a real
Node.js boot smoke test — matching Vercel's runtime, not Bun's) runs on
every push/PR, and `.github/workflows/tests.yml` runs `unit` (both
packages' unit tests) and `e2e` (its own throwaway Postgres, migrated
fresh and discarded at the end) as two parallel jobs in a separate
workflow, so a slow or flaky E2E run never blocks the fast typecheck
feedback loop.

## Auth — two independent, mutually exclusive toggles

**`requireAuth` (`api/src/middleware/auth.ts`)** — real per-user auth,
used to gate the whole sandbox demo to invited viewers only (e.g.
employers handed a login ahead of an interview) rather than leaving it
fully public. Verifies a Supabase-issued access token on every
`/applications/*`-style request, but only when `AUTH_ENABLED=true`;
left unset, it's a no-op. When enabled, also requires `SUPABASE_URL`
and `SUPABASE_ANON_KEY` (Project Settings → API — the anon/publishable
key, not the service-role key). The matching frontend login screen
(`web/src/components/login-screen.tsx`) is gated by its own
`VITE_AUTH_ENABLED` toggle — see Deploying below — and only ever calls
`supabase.auth.signInWithPassword`; there's no self-service signup, the
account is created directly in the Supabase dashboard and its
credentials handed out manually. `SUPABASE_ANON_KEY` ships in the
web app's public JS bundle once this is enabled, same tradeoff as
`VITE_API_TOKEN` below — Row Level Security (`0004_enable_rls.sql`),
not the key's secrecy, is what actually protects the data.

**`requireApiToken` (`api/src/middleware/api-token.ts`)** — a much
lighter alternative: a static shared-secret Bearer token gate for a
deployment that wants its frontend to stay fully public with no login
screen at all, while still blocking casual/direct access to the raw
API. Toggled by `API_TOKEN` (unset = no-op); the frontend sends the
matching `VITE_API_TOKEN` automatically. Since the token ships in the
public JS bundle, this is obscurity against naive/direct access, not
real security — only an acceptable tradeoff for a deployment holding
fake seeded data. The live sandbox above uses `requireAuth` instead,
not this gate.

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
4. To gate the deployment behind a login screen (see the Auth section
   above): `VITE_AUTH_ENABLED=true`, `VITE_SUPABASE_URL`, and
   `VITE_SUPABASE_ANON_KEY` (same project/key as the API's
   `SUPABASE_URL`/`SUPABASE_ANON_KEY`). The matching `AUTH_ENABLED=true`
   must also be set on the **API** project, or the frontend will show
   a signed-in user while every API request 401s.

**API (`api/`):**
1. New Vercel project, **Root Directory: `api`**. With this root, Vercel's
   zero-config detection finds `api/index.ts` (the `hono/vercel` adapter)
   as a serverless function automatically, and it deploys on Vercel's
   default Node.js runtime (`api/api/index.ts` sets
   `config.runtime: "nodejs"` explicitly). Vercel's Bun runtime for
   functions was tried and reverted after it started crashing every
   request in production — see `docs/deployment-journal.md` for the full
   incident.
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

**Sandbox data reset**: `.github/workflows/reset-sandbox.yml` runs
nightly (plus manual `workflow_dispatch`), re-running `api/scripts/seed.ts`
against the sandbox database via a `sandbox`-scoped GitHub Environment
secret — so the public demo always shows the same curated set of sample
applications regardless of what visitors add, edit, or delete.

## What's still deliberately out of scope

See `PLANNING.md` for the full reasoning behind the original phased
roadmap. AI/LLM features (JD parsing, resume-fit scoring) and
production-environment auth, both originally scoped as later phases, are
now built — see Features and Auth above. Still deliberately out:
**Trigger.dev** (e.g. flagging stale applications with no update in N
days) and **Langfuse** (LLM call tracing/observability) — both real fits
for this stack, not pulled in yet because there's no pressing need for
them ahead of the LLM calls and stage transitions that already exist.
**TanStack Router** and **multi-user support/an admin dashboard** were
considered and explicitly dropped, not deferred: this is a single-user
personal tool, and multi-tenancy has no natural finish line for a
days-long proof-of-concept.
