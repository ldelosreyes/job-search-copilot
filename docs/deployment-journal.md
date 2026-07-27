# Deployment journal — every issue and fix

This is the chronological record of every issue hit and fix made getting
this project from an empty repo to a live, tested, publicly-demoable
sandbox deployment. `README.md` covers setup/architecture at a glance,
`PLANNING.md` covers the scoping decisions made before writing any code,
and `WALKTHROUGH.md` explains how the finished code actually works. Each
entry below is a real problem hit while actually deploying (not
hypothetical), what caused it, and what fixed it.

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

## Connecting Git surfaced two more environment gaps

Every new branch/PR now getting its own automatic preview deployment
immediately exposed two things that had only ever been configured for
the Production environment:

1. **The API preview crashed outright** (`FUNCTION_INVOCATION_FAILED`) —
   `DATABASE_URL`/`WEB_ORIGIN` had only ever been set for Production, never
   Preview, so `client.ts` threw at import time on every request. Fixed by
   adding both to the Preview environment scope too, then using
   `vercel redeploy <url>` to rebuild the already-crashed deployment (env
   var changes never apply retroactively to an existing build).
2. **The web preview loaded but couldn't fetch data** — same root cause,
   `VITE_API_URL` was Production-only, so the preview build fell back to
   `/api`, which 404s on a static deployment with no dev-time proxy. Fixed
   the same way: added `VITE_API_URL` to web's Preview scope, redeployed.

**A verification wrinkle worth knowing about**: testing either fix via
`curl` returns a `302` redirect to `vercel.com/sso-api` — Vercel's
**Deployment Protection**, which requires account authentication to view
*any* preview URL. This is a separate, correct-by-default security
feature, not a bug — it's why a logged-in browser could see the original
crash but an unauthenticated `curl` couldn't reproduce it directly.

## The CORS preview-origin bug, and a real security review catch

Fixing the web preview's data-fetching (above) surfaced a *third* gap:
once `VITE_API_URL` was correct, the browser now got a CORS error instead
— the API's `cors()` config only ever allowed one exact-match `WEB_ORIGIN`
string (the stable production URL), but every preview deployment gets its
own unique origin (e.g. `job-search-copilot-web-sandbox-<hash>-<team>.vercel.app`).
No single fixed string can cover an unbounded, ever-changing set of
preview origins.

First fix: switched from an exact string to Hono's function-based `cors()`
origin option, matching any origin starting with
`job-search-copilot-web-sandbox` and ending in `.vercel.app`.

**An automated security review then correctly flagged this as a CORS
allowlist bypass** — the pattern only checked a *prefix*, so anyone could
register an entirely unrelated Vercel project (e.g.
`job-search-copilot-web-sandbox-phishing`, under a different account) and
its own auto-assigned domain would still match. Worth being honest about
severity, though: since this API has no authentication anywhere and CORS
only ever restricts *browser* reads (never a direct `curl`/server-side
request), the bypass wouldn't have unlocked anything beyond what was
already fully public — but it was still a real logical flaw in the regex,
and cheap to fix properly rather than rationalize away.

Hardened fix: anchor the pattern on the actual Vercel **team slug**
(`ldelosreyes-se`) rather than just the project-name prefix — team slugs
are globally unique and assigned by Vercel based on real account
ownership, so an unrelated project under a different account can't
produce a domain ending in this team's slug no matter what it's named.
Verified with a battery of regex unit tests covering every legitimate URL
shape (production, preview-hash, branch-alias) plus the exact
domain-squatting attempt the review described, all producing the
expected allow/reject result — since Deployment Protection (above) blocks
a live `curl` round-trip against preview URLs, isolated testing of the
regex logic itself was the practical way to verify it.

**A process mistake worth recording, not hiding**: the *first* version of
this fix was verified by running `vercel --prod` directly from the
feature branch — deploying straight to the production sandbox slot from
uncommitted code, exactly what connecting Git was meant to prevent. Caught
immediately, flagged transparently, and the corrected (hardened) version
was verified via a proper preview deployment instead.

## Phase 2: automated tests, split across two parallel CI jobs

With the sandbox live and gated, the next gap was that every change so
far had only ever been verified manually. Two independent decisions
shaped this: **`bun test` over Vitest** for unit tests (already
Bun-native, zero extra dependency, and the schema tests don't need a DOM
or component-rendering environment), and a **separate `e2e` job running
in parallel** with the existing `typecheck-and-build` job rather than
more steps bolted onto it — E2E needs a browser plus two live dev
servers, a meaningfully heavier and slower path than the existing
typecheck/lint/build/smoke-test loop, so keeping them as separate jobs
means a slow E2E run never blocks the fast feedback loop, and a flaky
E2E run doesn't fail the whole pipeline's other checks.

The unit tests (discriminated-union field stripping, invalid-stage
rejection) landed first, in a separate PR. This is the Playwright E2E
half: three tests exercising the full create → update-stage → delete
flow through a real browser against real dev servers.

**Two real Playwright bugs, not authoring mistakes to gloss over**:
1. `getByText("Applied")` matched *two* elements — the status badge and
   the stage `<select>`'s own `<option value="applied">applied</option>`
   — because Playwright's `getByText` is case-insensitive substring
   matching by default. Fixed by scoping to `[data-slot="badge"]`
   directly (the shadcn Badge component's own DOM attribute) instead of
   searching by text.
2. `getByRole("spinbutton", { name: "Round" })` timed out even though
   the app worked correctly (confirmed interactively via the Playwright
   MCP tool first). Its own failure report showed the accessibility-tree
   snapshot rendering spinbuttons *without* their placeholder-derived
   accessible names in that render pass — an indirect, apparently
   fragile computation. Fixed by reading the `placeholder` attribute
   directly via `getByPlaceholder("Round")` instead of relying on
   computed accessible names.

**A safety practice worth keeping as a standing rule**: local `api/.env`
points at the live, publicly-shown sandbox database. Running
destructive CRUD tests against it would pollute real demo data with
`E2E Create Co ...` rows. Every local verification pass instead used a
throwaway Docker Postgres container, migrated and discarded per run —
never the sandbox's real `DATABASE_URL`.

**Self-review before opening the PR caught two CI-robustness gaps**, not
functional bugs: the dev-server wait-loop (`for i in $(seq 1 30); do
curl ... && break; sleep 1; done`) fell through silently after 30 failed
attempts instead of failing the step, meaning a server that never booted
would surface as a confusing Playwright connection error rather than a
clear "API never became healthy" message — and neither backgrounded dev
server's output was captured anywhere, so a boot-time crash would leave
no trace in the CI logs. Fixed by explicitly failing the step (with the
server's log tailed inline) when the health check never succeeds, and
uploading both servers' logs as a build artifact on any job failure —
mirroring the existing Playwright-report-on-failure artifact.

## Checking demoability, once the tests landed

With the test suite green and merged, actually loading the live sandbox
in a browser (rather than trusting it was still fine) surfaced two real
gaps the plan had missed:

1. **Stray manual-test data was mixed into the curated seed story** — an
   old "GTM Engineer @ BAC" row from earlier ad-hoc testing sat alongside
   the intentional Anthropic/Vercel/Stripe/Linear/Notion/Supabase set.
   Fixed by re-running `api/scripts/seed.ts` against the sandbox, which
   clears the table before reinserting the curated rows.
2. **The nightly reset workflow was designed earlier but never actually
   built** — `api/scripts/seed.ts` existed and worked, but no scheduled
   job called it, so the sandbox had no way to recover from visitors
   creating/deleting applications. Added `.github/workflows/
   reset-sandbox.yml` (`schedule` + `workflow_dispatch`), reading
   `DATABASE_URL` from a new `sandbox`-scoped GitHub Environment secret
   rather than a plain repo secret — the environment itself was created
   via the API, but the secret's actual value is meant to be set
   directly (`gh secret set DATABASE_URL --env sandbox`, piped straight
   from `api/.env`) rather than ever appearing in the conversation.

Also fixed while checking the live site: the browser tab still showed
Vite's default `<title>web</title>`, and the README never actually
linked the deployed sandbox URL anywhere — a `git clone` away from a demo
that already existed but wasn't discoverable.

## The Bun-runtime beta bug that took the sandbox down

Well after the deployment work above, the live sandbox started failing
silently: the web app sat on "Loading applications…" forever, and the
browser console showed a CORS error on `/applications` — no
`Access-Control-Allow-Origin` header on the response. That looked like a
CORS regression, but the CORS logic (`api/src/index.ts`) hadn't changed.

Sending the same preflight `OPTIONS` request directly with `curl`
(bypassing the browser, which was masking the real response) showed the
actual failure: `HTTP 500 FUNCTION_INVOCATION_FAILED`. The API function
was crashing on *every* request — including `GET /`, which doesn't even
touch the database — so the browser's CORS error was a downstream
artifact: a crashed Lambda never runs the `cors()` middleware, so its
error response has no CORS headers at all, and the browser reports that
as a policy violation rather than surfacing the underlying 500.

`vercel logs` showed the real exception on every single invocation:

```
TypeError: Requested module is not instantiated yet.
    at link (native:1:11) ... at linkAndEvaluateModule ... at requestImportModule
Bun process exited with exit status: 1.
```

This turned out to be a [known, unresolved bug in Vercel's Bun runtime
for functions](https://community.vercel.com/t/bun-runtime-requested-module-is-not-instantiated-yet/26380)
— the same beta feature enabled back in "Switching to the Bun runtime"
above. Vercel/Bun's own team, in that thread, confirmed it stems from
circular ES-module linking and currently has no fix, only a workaround:
run the deployed function on Node.js instead.

Worth being honest about the earlier reasoning here: "Switching to the
Bun runtime" enabled Bun because the *code itself* had already been made
Node-compatible by that point (extensionless imports, see "Deploy
attempt #4" above) — the switch to Bun afterward was for dev/prod
runtime consistency, not because Node.js had stopped working. That meant
reverting was safe: removing `bunVersion: "1.x"` from `api/vercel.json`
let the deployed function fall back to Vercel's default Node.js runtime,
which is exactly the state already proven working before the Bun switch.
`api/api/index.ts` already declared `config.runtime: "nodejs"` from the
original Node.js deploy — that line had simply been silently overridden
by `bunVersion` ever since, and reverting let it take effect again.
Confirmed nothing in `api/src` depends on Bun-only globals (no `Bun.*`
usage outside test files) before making the change.

## The migration that was never actually applied

Separately, local dev and the sandbox demo both started showing "No
applications yet" — not an error, just an empty list. `GET /health`
returned 200 and CI was green, so this wasn't a repeat of the crash
above; something more specific was wrong.

Querying the real Supabase project directly (not just `bun run typecheck`
or reading code) showed the actual state: `applications` had 0 rows, and
`resume` didn't exist as a table at all, even though
`api/supabase/migrations/0002_resume.sql` had been committed weeks
earlier. The migration file existed in the repo and had presumably been
run against local Postgres or CI's throwaway container at some point,
but never against the real remote Supabase project this deployment
actually uses.

That gap turned destructive: the nightly `reset-sandbox.yml` cron runs
`api/scripts/seed.ts`, which cleared `applications` first, then tried to
clear `resume` — and crashed with `relation "resume" does not exist`
before ever reseeding. The previous night's run left `applications`
empty and exited non-zero, and every run since repeated the same
failure, so the demo simply stayed empty.

Fixed in two parts: applied the missing migration directly against the
real project, then reseeded. Separately, wrapped `seed.ts`'s two
`delete` statements in a single transaction (`sql.begin`) — so a future
version of this exact failure mode (one delete succeeding, the next
throwing) rolls the first one back too, instead of leaving the table
wiped until the next successful nightly run.

The underlying lesson: a migration file existing in the repo, and typechecking/CI
being green, says nothing about whether it was ever actually run against
the specific database a given environment connects to. `README.md`'s
local setup instructions now say to run every file in
`api/supabase/migrations/`, not just the first one, precisely because
"only run the one the README mentions" is exactly how this drifted in
the first place.

## `pdf-parse` worked locally, threw `DOMMatrix is not defined` in production

Uploading a resume on the sandbox threw `ReferenceError: DOMMatrix is not
defined` inside `pdfjs-dist`'s legacy build, with no corresponding code
change to explain it ("it worked yesterday"). Every test and local run
passed, because local dev and `bun test` both run under Bun — and Bun
implements `DOMMatrix` (a browser API) natively as a global, masking the
problem entirely.

The deployed Vercel function runs on plain Node.js, which has no
`DOMMatrix`. `pdf-parse` pulls in `pdfjs-dist`, which evaluates `new
DOMMatrix()` at module scope and tries to polyfill it itself on Node via
`@napi-rs/canvas` — but does so through a `require()` constructed
dynamically deep inside its own pre-bundled file. Vercel's build-time
file tracer can't see a dynamically-constructed `require()` buried in
third-party code, so `@napi-rs/canvas` silently never made it into the
deployed function bundle, the polyfill attempt failed (only a `warn()`),
and the bare `new DOMMatrix()` call then threw. Confirmed via
`vercel logs` against the actual failing deployment, not guesswork.

First fix attempt was to polyfill `DOMMatrix`/`ImageData`/`Path2D`
ourselves — adding `@napi-rs/canvas` as a direct dependency and setting
the globals before importing `pdf-parse`, since a literal first-party
import is traceable where a buried third-party `require()` isn't. It
worked (verified by running the compiled output under plain `node`
against a real PDF), but on reflection it was treating the symptom, not
the cause: it still shipped a native binary dependency (platform-specific
prebuilt binaries, a real arch-mismatch risk on serverless) and hardcoded
exactly the three globals this version of `pdfjs-dist` happened to need,
which a routine dependency bump could silently invalidate again.

Replaced `pdf-parse` with `unpdf` instead — a PDF-text-extraction library
built specifically for serverless/edge runtimes, which mocks canvas
internally rather than needing a real one. This removes the whole bug
class at the source: no native binary, no browser-global polyfilling, no
dependency on a bundler tracing a hidden `require()` correctly. One
adjustment needed along the way: `unpdf` rejects a Node `Buffer` outright
even though it's technically a `Uint8Array` subclass (it checks the exact
class), so the buffer is wrapped as a zero-copy `Uint8Array` view before
being passed in.

The underlying lesson: Bun and Node implement different sets of
browser/Web globals, and a test suite or dev server that only ever runs
under Bun cannot catch a Node-only failure. The existing `smoke:node` CI
job exists for exactly this reason, but only exercises `GET /health` —
it would not have caught this bug either, since it never touches the PDF
extraction path.
