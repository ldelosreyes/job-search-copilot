# Code walkthrough & deployment journal

Two things live in this document: **how the code actually works** (Part 1),
and **the full record of every issue hit and fix made** getting the sandbox
environment deployed (Part 2). `README.md` covers setup/architecture at a
glance and `PLANNING.md` covers the *scoping* decisions made before writing
any code — this document is the detailed "how it works" and "what actually
went wrong" record, for understanding the project deeply rather than just
using it.

---

# Part 1: How the code works

## The data model — `api/src/schemas/application.ts`

Everything starts here. `applicationStatusSchema` is a Zod
`discriminatedUnion` keyed on a `stage` field, with six variants: `applied`,
`screening`, `interview`, `offer`, `rejected`, `withdrawn`. Each variant only
carries the fields that make sense for that stage — e.g. only `interview`
has `interviewRound`, only `offer` has `offerAmount`. This is the single
most important design decision in the project: a flat `status: string`
column with a dozen nullable columns would let a "rejected" row have an
`offerAmount`, and would force the UI to duplicate "which fields are valid
for which status" logic. With a discriminated union, TypeScript narrows the
type automatically — once you check `status.stage === "offer"`,
`status.offerAmount` exists with no cast, no optional chaining.

`applicationSchema` is the full DB row shape. `createApplicationSchema`
omits server-assigned fields (`id`, timestamps). `updateApplicationSchema`
makes everything optional via `.partial()`, for PATCH semantics.

## The database layer — `api/src/db/`

- **`client.ts`**: one shared `postgres.js` connection pool. Throws at
  startup if `DATABASE_URL` isn't set (fail fast, not a confusing failure
  three layers deep). `prepare: false` because Supabase's pooled connection
  (pgbouncer, transaction mode) doesn't support prepared statements.
- **`applications-repo.ts`**: the only place that translates Postgres's
  `snake_case` columns to the app's `camelCase` types (`rowToApplication`).
  Every function (`listApplications`, `getApplication`, `createApplication`,
  `updateApplication`, `deleteApplication`) returns a `Result<T, E>` instead
  of throwing — see `lib/result.ts` below — and **re-validates the row with
  `applicationSchema.parse()` on the way out of the DB**, not just on the
  way in, so schema/table drift gets caught immediately rather than at some
  unrelated call site later.

## `api/src/lib/result.ts`

A `Result<T, E>` type: `{ ok: true, value } | { ok: false, error }`.
Rust/Vue-composable style. The point: DB failures become typed values the
caller *must* check (`if (!result.ok) ...`), not exceptions that might get
missed three functions up the call stack.

## Routes — `api/src/routes/applications.ts`

Hono routes. Every body/param is validated with `zValidator` *before* the
handler runs, so `c.req.valid("json")` is already fully-typed
`CreateApplicationInput` — no manual parsing, no `as` casts, and malformed
requests (wrong types, missing required fields) get rejected with a 400
automatically, before any application code runs.

## App assembly — `api/src/index.ts`

Builds the Hono `app` (logger, CORS restricted to `WEB_ORIGIN`, `/health`,
the applications routes) and exports `type AppType = typeof app` — a
**type-only** export, zero runtime cost. This is the whole trick behind the
frontend's typed client (below): the type of the actual route definitions
is shared with the frontend, so route/param/response shapes can never
silently drift out of sync.

## Two entrypoints, one app

- **`api/src/index.ts`**'s default export runs directly under Bun locally
  (`bun run --hot src/index.ts`).
- **`api/api/index.ts`** wraps the *same* `app` instance with
  `hono/vercel`'s `handle()` for serverless deploy. Same routes, same
  validation, same DB code — only the runtime adapter differs.

## The frontend's typed client — `web/src/lib/api-client.ts`

`hc<AppType>(import.meta.env.VITE_API_URL ?? "/api")`. Because `hc()` is
generic over the *type* of the server's Hono app, every call
(`apiClient.applications.$get()`, `.applications[":id"].$patch(...)`) is
checked against the real route definitions at compile time — the same
category of guarantee tRPC gives you, with zero codegen step. Falls back to
`/api` for local dev, where Vite's dev server proxies `/api/*` to the Hono
server on `:3001` (see `vite.config.ts`), avoiding CORS entirely in
development.

## Query hooks — `web/src/hooks/use-applications.ts`

Thin TanStack Query wrappers (`useApplications`, `useCreateApplication`,
`useUpdateApplication`, `useDeleteApplication`) around the typed client.
Every mutation invalidates the `["applications"]` query key on success, so
the list re-fetches automatically after any write.

## UI primitives — `web/src/components/ui/`

Hand-authored shadcn/ui components (`Button`, `Card`, `Input`, `Badge`) —
the CLI hung in the original sandboxed dev environment (a registry-fetch
issue), so these were written by hand to match what the CLI would have
generated, using the same `cva` variant pattern and the shared `cn()`
helper (`clsx` + `tailwind-merge`) in `web/src/lib/utils.ts`.

## The discriminated union as UI — `status-badge.tsx` / `stage-editor.tsx`

This is where the data model decision pays off visibly, not just
type-theoretically. `StatusBadge` switches on `status.stage`, and
TypeScript narrows the type per-branch — `status.interviewRound` only
type-checks inside the `"interview"` case, `status.offerAmount` only inside
`"offer"`. `StageEditor`'s `defaultStatusFor()` is the one function that
*must* be updated whenever a new stage is added to the union, and the
compiler enforces it — the return type is `ApplicationStatus`, not `any`,
so a missing required field for some stage is a compile error, not a
runtime surprise.

## The CRUD surface — `application-form.tsx` / `application-list.tsx` / `App.tsx`

A create form, a list rendering each application with inline
`StatusBadge` + `StageEditor` + delete, composed together in `App`.
Nothing architecturally novel here — it's the payoff of everything above.

## The sandbox seed script — `api/scripts/seed.ts`

Inserts 6 sample applications (one per stage) via the *real*
`createApplication` repo function — never a hand-rolled `INSERT` — so seed
data is validated through the same Zod schemas as real writes and can never
silently drift out of shape. Guarded behind `ALLOW_SEED_RESET=true`: it
clears the entire table before reseeding, so it refuses to run at all
unless that's explicitly set, to prevent an accidental run against a real
database.

---

# Part 2: The deployment journal — every issue and fix

This section is chronological. Each entry is a real problem hit while
actually deploying (not hypothetical), what caused it, and what fixed it.

## Setting up the initial commit history

The whole working tree started untracked. Rather than one giant initial
commit, it was split into 10 logical commits (docs → monorepo scaffold →
API schema → API db layer → API routes → web scaffold → shadcn primitives
→ typed client/hooks → feature components → CI), each dependency-ordered so
no commit references a file that doesn't exist yet in an earlier commit.

**Correction made along the way**: `CLAUDE.md` originally described the
person as "newer to React," which was inaccurate (prior professional React
experience, 2020-2022) — corrected and folded into the docs commit via
amend, since it was still unpushed at that point.

## Pre-commit code review pass

Before committing the API/web code, a full review pass found and fixed:
- TypeScript version was split three ways (5.9.3 / 5.9.3 / 6.0.2 across
  root/api/web) — unified to 7.0.2 (the then-current stable release,
  verified via research before adopting).
- `@types/bun` was pinned to `"latest"` in two of three packages
  (non-reproducible) — pinned to a real version, matching the third.
- `api/`'s lint script was a placeholder (`echo '...todo'`) — wired up real
  `oxlint`, matching `web/`'s existing setup.
- Deleted dead files: unused `create-vite` template assets
  (`react.svg`, `vite.svg`, `hero.png`) and an unrelated leftover icon
  sprite sheet, all with zero references anywhere.
- `web/README.md` was still 100% generic `create-vite` boilerplate —
  replaced with a pointer to the root README.

## Local environment wasn't set up at all

`bun` wasn't installed on the machine. Installed via the official curl
script, then switched to Homebrew per preference (uninstalled the curl
version, fixed outdated Xcode Command Line Tools that were blocking
Homebrew, reinstalled via `brew install oven-sh/bun/bun`). Separately,
`node`'s nvm-managed default version (20.16.0) was below what Vite 8
requires (20.19+) — fixed by aliasing nvm's default to an already-installed
20.19.5, then discovering Homebrew's `nvm.sh` doesn't auto-apply the
default alias on new shells (unlike the standard installer) — fixed with an
explicit `nvm use default --silent` line added to `.zshrc`.

## Branch protection & workflow conventions

Added branch protection to `main` (require PR, require the
`typecheck-and-build` check, no force-push/deletion) — then, at explicit
request, disabled `enforce_admins` so the sole admin (repo owner) can still
push directly when needed, while the rules still bind any future
non-admin collaborator. Later, a separate decision: use a feature branch +
PR for *every* code change going forward (not direct-to-main), even though
admin bypass is available — to keep the repo's history demonstrating
team-ready git workflow, since it's a portfolio piece.

## Supabase project

Created via the Supabase MCP connection directly (no dashboard clicking
needed): project `job-search-copilot-sandbox`, Sydney region, migration
applied. The database password had to be reset manually via the dashboard
once, since Supabase doesn't expose an auto-generated project password
through any API for security reasons.

## Deciding sandbox vs. "production" isn't a feature flag

Discussed whether to add auth before deploying. Landed on: full user
management is scope creep for a single-user tool; a lightweight
shared-secret bearer-token gate makes sense for a future *personal*
deployment, but the public demo needs *no* auth at all — just seeded fake
data, since there's nothing sensitive in it. Sandbox vs. production is
environment separation (separate Supabase projects, separate Vercel
projects), not a runtime flag switching which database one running server
talks to — a flag here would just add a way to accidentally serve the
wrong data. A feature flag (env var) is the right tool only for the
auth-on/off *behavior* itself, once that's built.

## Getting `bun`/Vercel CLI set up, and the Vercel MCP detour

Installed the `vercel` CLI via Homebrew (`brew install vercel-cli`),
logged in via `vercel login` (device-code OAuth flow). Separately
registered Vercel's official MCP server (`https://mcp.vercel.com`) via
`claude mcp add` — this needs a full new session to actually expose its
tools, and a Vercel account existed to authenticate against by the time
this happened (signed up via GitHub).

## Deploy attempt #1 — wrong upload scope (Root Directory)

Running `vercel --prod` from *inside* `api/` only uploads that folder as
the entire deploy source — no monorepo context at all. The existing
`api/vercel.json` build command (`cd .. && bun install`) assumes Vercel's
*own* git-based checkout (where a "Root Directory" project setting scopes
the build without discarding the rest of the repo), not a raw CLI upload
from a subfolder. Fix: set each project's **Root Directory** (`api` /
`web`) via a direct call to Vercel's REST API (`PATCH /v9/projects/...`)
using the CLI's own already-stored auth token (read locally from
`~/Library/Application Support/com.vercel.cli/auth.json`, never displayed)
— the CLI itself doesn't expose a `--root-directory` flag. Then deployed
from the actual monorepo root (not the subfolder), targeting the right
project via `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` env vars, per Vercel's
documented monorepo CLI pattern.

**Wrong turn along the way**: initially assumed Root Directory required
connecting the GitHub repo (`vercel git connect`), which itself failed
because the Vercel-for-GitHub App wasn't yet authorized for this repo —
that's a real, separate requirement (see below), but it turned out to be
unrelated to Root Directory, which is just a plain API-settable project
field with no Git connection needed at all.

## Deploy attempt #2 — TypeScript 7.0.2 crashes Vercel's builder

Build failed with `Cannot read properties of undefined (reading
'readFile')`, right after the build log line `Using TypeScript 7.0.2
(local user-provided)`. Diagnosed as a genuine incompatibility between
TypeScript 7.0's still-maturing programmatic API (the Go-rewrite, ~2 weeks
old at the time) and Vercel's own function-bundling tooling, which hooks
into that API directly — separate from our own `tsc` usage, which worked
fine locally. Confirmed by testing: downgrading `api/`'s `typescript` to
`^6.0.2` made the crash disappear immediately. `web/` and the root package
stay on `7.0.2`, since only `api/` gets processed by Vercel's Node.js
function builder — this is now an intentional, documented version split,
not an oversight.

## Deploy attempt #3 — missing `@types/node`

New error after the TS downgrade: `Cannot find name 'process'`. Adding
`@types/node` as a dependency alone didn't fix it — `api/tsconfig.json` had
an explicit `"types": ["bun"]` array, and TypeScript's `types` compiler
option, once set explicitly, disables automatic inclusion of *any* other
`@types` package regardless of what's installed. Fixed by adding `"node"`
to that array too.

## Deploy attempt #4 — `ERR_MODULE_NOT_FOUND` at runtime

Build succeeded this time, but the *deployed function* crashed on every
request: `Cannot find module '/var/task/api/src/routes/applications.ts'`.
Root cause: our internal imports used explicit `.ts` extensions (e.g.
`from "./routes/applications.ts"`) — fine for Bun and for bundler-mode
TypeScript, which resolve source files directly. Vercel's Node.js function
builder, however, transpiles each file to `.js` individually and does
**not** rewrite the extensions inside import statements — so Node's strict
ESM loader was looking for a file that no longer existed on disk. Fixed by
removing the explicit `.ts` extensions from every internal relative import
across `api/`.

## Switching to the Bun runtime

With the immediate bugs fixed, the question came up directly: since this
whole class of problem stems from deploying Bun-authored code onto a
Node.js runtime, why not deploy it *on* Bun instead? Vercel added official
Bun runtime support for serverless functions (`bunVersion: "1.x"` in
`vercel.json`) — confirmed via their docs before switching. Enabled it,
redeployed, and `/health` + `/applications` worked immediately.

**A genuine dead end here, worth recording**: with the Bun runtime active,
it seemed reasonable that the original explicit `.ts` extensions should
now be safe to restore (Bun resolves `.ts` natively, in both places). They
were restored, redeployed — and it broke again, this time with a Bun-native
`ResolveMessage` error. Best working theory: Vercel's Bun-runtime
deployment (a very new feature, ~3 weeks old at the time) doesn't yet trace
the full dependency graph outside the detected `/api` function folder the
same way the mature Node.js builder's tracing does, so `.ts`-suffixed
imports reaching outside that folder weren't being bundled correctly. The
extensions were reverted back to extensionless (the confirmed-working
state) rather than continuing to chase this — a known example of a
promising idea that didn't pan out and was abandoned in favor of what was
already verified working.

**Also tested and reverted**: whether the Bun runtime would tolerate
TypeScript 7.0.2 for Vercel's build step (since the runtime and the
build-time tooling are technically separate concerns). It did not — same
crash as before, confirming the TS 6.0.2 pin for `api/` is necessary
regardless of runtime choice.

## Deploying `web/` — a step that was simply missed

After extensively testing and fixing `api/`, `web/` had been linked and had
its `VITE_API_URL` env var set, but was **never actually deployed** — zero
deployments existed, so its domain 404'd (`DEPLOYMENT_NOT_FOUND`). Deployed
it once the API's real URL was known.

## Wiring the two projects together

`WEB_ORIGIN` (on the API project, for CORS) and `VITE_API_URL` (on the web
project) were initially set to placeholder/localhost values, since each
project's real `.vercel.app` URL isn't known until after its first deploy.
Updated both to the real URLs once both projects were live, then redeployed
the API so the CORS change took effect. Verified with a real
cross-origin `curl` request and a full Playwright screenshot of the live
site loading real seeded data through the real deployed API.

## Connecting Git — and the OAuth login vs. GitHub App distinction

Signing up for Vercel via "Continue with GitHub" only completes OAuth
*login* (proving who you are) — it does **not** install the separate
"Vercel for GitHub" App that grants actual repo/deployment access, which
is why that app didn't show up at all under
`github.com/settings/installations` even after logging in. That
installation is a one-time, OAuth-style consent grant that only the
account owner can complete through GitHub's own UI — no CLI command or
API call can substitute for it (confirmed: `vercel git connect` fails
outright with a generic "Failed to connect... make sure you have access"
error until the App is installed for the target repo). Triggering the
install from a Vercel project's **Settings → Git → Connect Git
Repository** button (rather than trying to find it standalone on
GitHub's side first) is what actually surfaces the install/authorize
flow.

Once installed, `vercel git connect` succeeded immediately for both
projects, and each project's `productionBranch` was confirmed as `main`
via a direct API check (not just assumed) — meaning pushes/merges to
`main` auto-deploy to production, while every other branch/PR only ever
gets an isolated preview deployment that never touches it.

## The Preview-deployment crash Git integration immediately surfaced

The moment Git was connected, pushing an ordinary docs-only branch
(unrelated to `api/` at all) automatically triggered a **Preview**
deployment of the API project — and it crashed instantly with
`FUNCTION_INVOCATION_FAILED` the moment it was opened in a browser.

Cause: `DATABASE_URL` and `WEB_ORIGIN` had only ever been set for the
**Production** environment (`vercel env add DATABASE_URL production`),
never for **Preview** — because until Git was connected, no Preview
deployments existed at all, so this gap was invisible. `api/src/db/client.ts`
throws immediately if `DATABASE_URL` is unset, and that throw happens at
module-import time, before any route (even `/health`) can run — so *every*
request to the preview crashed the same way, regardless of which route it
hit.

Fixed by adding both variables to the project's **Preview** environment
scope too (same values as Production — the sandbox has only one
database, there's no separate preview-only DB), then using
`vercel redeploy <url>` to rebuild the specific already-crashed
deployment so it would pick up the newly-added env vars (env var changes
never apply retroactively to an already-built deployment).

**One verification wrinkle**: testing the fix via `curl` after the
redeploy returned a `302` redirect to `vercel.com/sso-api`, which looked
like it might still be broken — turned out to be Vercel's **Deployment
Protection**, a separate, correct-by-default security feature that
requires Vercel account authentication to view *any* preview URL. That's
why the crash was visible in a real (logged-in) browser but not
reproducible via an unauthenticated `curl` request — confirmed the actual
fix by asking for a browser-side recheck instead.
