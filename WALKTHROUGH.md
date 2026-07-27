# Code walkthrough — how the code works

This document explains how the code actually works, function by function.
`README.md` covers setup/architecture at a glance, `PLANNING.md` covers the
*scoping* decisions made before writing any code, and
`docs/deployment-journal.md` is the full, chronological record of every
issue hit and fix made getting the sandbox environment deployed.

---

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

The schema also carries four server-only fit-score fields (`fitScore`,
`fitRationale`, `fitScoredAt`, `fitScoreFingerprint`) — see the AI section
below. `createApplicationSchema`/`updateApplicationSchema` both `.omit()`
them, so a client can never set them directly; only `setFitScore` (in the
repo, below) writes them.

## Routes — `api/src/routes/applications.ts`

Hono routes. Every body/param is validated with `zValidator` *before* the
handler runs, so `c.req.valid("json")` is already fully-typed
`CreateApplicationInput` — no manual parsing, no `as` casts, and malformed
requests (wrong types, missing required fields) get rejected with a 400
automatically, before any application code runs.

`POST /:id/fit-score` scores one already-tracked application against the
current resume and persists the result via `setFitScore` — distinct from
the standalone `POST /fit-score` (below), which scores ad-hoc JD text
before an application even exists yet, during the "Analyze with AI"
creation flow.

## App assembly — `api/src/index.ts`

Builds the Hono `app` (logger, CORS restricted to `WEB_ORIGIN` plus a
regex allowing any Vercel preview domain in this project's own team/app
family, `/health`, and the `applications`/`resume`/`jd-parse`/
`fit-score`/`fit-score-all` routes, each gated behind `requireApiToken`
then `requireAuth`) and exports `type AppType = typeof app` — a
**type-only** export, zero runtime cost. This is the whole trick behind the
frontend's typed client (below): the type of the actual route definitions
is shared with the frontend, so route/param/response shapes can never
silently drift out of sync.

`index.ts` also fails fast at startup if both `API_TOKEN` and
`AUTH_ENABLED=true` are set together — see the api-token section below for
why that combination can never work.

## The auth toggle — `api/src/middleware/auth.ts`

`requireAuth` verifies a Supabase-issued access token
(`supabase.auth.getUser(token)`, the anon key, not the service-role key —
this only needs to answer "is this a real, currently valid session," no
admin operations) on every `/applications/*` request — but only when
`AUTH_ENABLED=true`. Left unset, it's a no-op, so the sandbox environment
(which never sets it) behaves exactly as it did before this middleware
existed. Only the future production environment sets it.

The `authEnabled` check and the Supabase client itself are both
constructed **once, at module load**, not per-request — and if
`AUTH_ENABLED=true` but `SUPABASE_URL`/`SUPABASE_ANON_KEY` are missing,
it throws immediately at startup, matching `db/client.ts`'s existing
fail-fast pattern for `DATABASE_URL`. This wasn't the first version:
the initial implementation checked for those env vars *inside* the
middleware, lazily, on first use — which meant a misconfigured deployment
would only fail on the first real request (as a confusing `500`), not at
startup. Caught by testing a garbage token locally: expected a `401`,
got a `500`, traced it to the lazily-thrown error, moved the check to
module load instead.

**A second issue, caught by self-review before this was ever pushed**:
the toggle itself (`process.env.AUTH_ENABLED === "true"`) is an exact
string match — meaning `AUTH_ENABLED=1` or `AUTH_ENABLED=True` (both
plausible typos when actually deploying production) would silently
evaluate to `false`, running with *no auth at all* and no indication
anything was wrong. Fixed by logging the resolved state unconditionally
at startup (`Auth: ENABLED` / `Auth: DISABLED`) — cheap, and turns a
silent misconfiguration into something visible in deploy logs the moment
it happens.

## A second, deliberately different gate — `api/src/middleware/api-token.ts`

`requireAuth` (above) is real per-user auth, meant for a future
*production* environment with an actual login screen. But the *sandbox*
has a different requirement entirely: the frontend should stay fully
public with no login screen at all, while direct/casual access to the
raw API should still be blocked. Neither "real auth" nor "no auth"
fits that — so `requireApiToken` is a third, separate option: a static
shared-secret Bearer token, reusing Hono's own built-in `bearerAuth`
middleware rather than hand-rolling a string comparison, toggled by
`API_TOKEN` (unset = no-op, same pattern as `AUTH_ENABLED`). The
frontend sends the matching secret automatically as `VITE_API_TOKEN`,
baked into its public build — meaning this is honestly obscurity
against casual/naive access, not real security against someone
determined enough to extract the token from the shipped JS bundle, an
accepted tradeoff since the sandbox only ever holds fake seeded data.

**Caught by self-review before this was pushed**: nothing stopped
`API_TOKEN` and `AUTH_ENABLED=true` from being set simultaneously — and
since both middlewares read the same `Authorization` header but check
it in incompatible ways (a static-string match vs. a valid-JWT check),
no single token could ever satisfy both at once. The result wouldn't be
a security bypass (it fails closed — everything 401s), but it would be
a deeply confusing "why is nothing working" debugging session with no
clue why. Fixed with an explicit startup check that throws a clear error
if both are ever configured together, rather than leaving that
discovery to a future debugging session.

**A testing mistake worth recording**: the first attempt to verify the
frontend actually sends `VITE_API_TOKEN` used `curl` directly against
Vite's dev-proxy path — which proved nothing, since that bypasses the
frontend's JavaScript entirely (the `Authorization` header is only ever
attached by `api-client.ts`'s code running in an actual browser, not by
whatever hits the proxy URL directly). Caught immediately and redone
properly with a real Playwright browser session instead: a matching
token loads real data, a mismatched one shows the app's existing
graceful error state rather than a crash.

## Two entrypoints, one app

- **`api/src/index.ts`**'s default export runs directly under Bun locally
  (`bun run --hot src/index.ts`).
- **`api/api/index.ts`** wraps the *same* `app` instance with
  `hono/vercel`'s `handle()` for serverless deploy, on Vercel's Node.js
  runtime (`config.runtime: "nodejs"`, not Bun — see
  `docs/deployment-journal.md` for why the Bun runtime was tried and
  reverted). Same routes, same validation, same DB code — only the
  runtime adapter differs.

## LLM calls — `api/src/lib/llm-client.ts` and `ai-limits.ts`

`callChatModel(messages, jsonSchema, maxTokens)` is the one function every
AI route calls. It tries Cerebras first, falls back to Groq on a 402, 429,
5xx, or network error — both providers host the same `gpt-oss-120b`
weights over an OpenAI-compatible API, so this is a `baseURL`/key/model-id
config swap, not a provider-abstraction layer. Both provider clients are
constructed lazily (module-level `undefined` until first real use, not at
import time) — an eager `requireEnv()` at module scope used to throw the
moment `index.ts` imported the AI routes, crashing *every* route including
`/health` whenever `CEREBRAS_API_KEY`/`GROQ_API_KEY` were unset, which they
are on this project's preview deployments. Each SDK client also sets
`maxRetries: 0`, so a failing provider's own retry logic doesn't burn 2-3
attempts before `callChatModel`'s fallback ever gets a chance to try the
other one.

`ai-limits.ts` centralizes every size/token cap the AI routes use
(`JD_TEXT_MAX_CHARS`, `RESUME_TEXT_MAX_CHARS`, `RESUME_MAX_BYTES`,
`FIT_SCORE_MAX_TOKENS`, and the `FIT_SCORE_ALL_*` trio), each overridable
via env var so a self-hosted deployment with its own paid keys can raise
them without a code change.

## The resume pipeline — `extract-resume-text.ts`, `db/resume-repo.ts`, `routes/resume.ts`

`extractResumeText` pulls raw text out of an uploaded PDF (`pdf-parse`) or
DOCX (`mammoth`); `detectResumeFileType` identifies which by file
extension first, MIME type as a fallback, since clients are inconsistent
about setting `Content-Type` on multipart parts. `pdf-parse`'s import is
dynamic, not top-level — it pulls in `pdfjs-dist`, which references the
browser-only `DOMMatrix` global at module scope, and a top-level import
would crash the entire app on Node cold start, not just PDF uploads.

The resume itself is a single-row table (`id = 1`) — one resume at a time,
matching the single-user scope. `db/resume-repo.ts` splits reads into
`getResumeStatus` (filename + `updatedAt` only, safe to return from `GET
/resume`) and `getResumeContent`/`getResumeSnapshot` (the actual extracted
text, read server-side only by the fit-score routes, never serialized
back to a client). `upsertResumeAndClearScores` and
`deleteResumeAndClearScores` both run in a transaction that also nulls out
every application's cached `fit_score`/`fit_rationale`/`fit_scored_at`/
`fit_score_fingerprint` — a new or removed resume invalidates every score
computed against the old one.

## Fit-score fingerprinting — `api/src/lib/fit-score-fingerprint.ts`

`computeFitScoreFingerprint(jdText, roleTitle, resumeUpdatedAt)` hashes
(SHA-256, `\0`-separated so field boundaries can't collide) the three
inputs a fit score actually depends on. A stored score is stale exactly
when its fingerprint no longer matches a fresh computation — no separate
"is this stale" flag to keep in sync by hand whenever a JD, role title, or
resume changes.

## Scoring routes — `routes/fit-score.ts`, `fit-score-all.ts`, `applications.ts`'s `POST /:id/fit-score`

Three distinct scoring entry points, each for a different moment:

- **`POST /fit-score`** — ad-hoc, no application required yet. Used by
  "Analyze with AI" (below) to preview a fit score while a new application
  is still being drafted. Never persists anything.
- **`POST /applications/:id/fit-score`** — scores one already-tracked
  application and persists the result via `setFitScore`
  (`applications-repo.ts`), which locks the resume row (`for share`)
  inside the same transaction so a concurrent resume replace/delete can't
  write a score against a resume version that's already gone — the write
  either lands before the resume changes, or the version check fails and
  the update is skipped (409 back to the caller), never a silent mismatch.
- **`GET`/`POST /fit-score-all`** — batches every eligible application
  (has a `jdText`) whose fingerprint doesn't match the current resume,
  capped at `FIT_SCORE_ALL_MAX_APPLICATIONS` per call, in one LLM request.
  `GET` reports `eligibleCount`/`scoreableCount` so the frontend can show
  "scores up to date" without spending a call; `POST` does the actual
  scoring and validates the model's returned IDs are exactly the set that
  was sent — a mismatched ID set is treated the same as a malformed
  response (502), not partially applied.

All three routes (and `jd-parse.ts`) share the same failure shape: a
`callChatModel` throw (both providers failed) maps to a 502 "AI providers
are temporarily unavailable"; a response that parses as JSON but fails its
route-specific Zod schema also maps to a 502 "AI response was invalid" —
structured-output mode constrains the model's *shape* but this project
never trusts that blindly.

## JD parsing — `api/src/routes/jd-parse.ts`

`POST /jd-parse` asks the model to extract `company`/`roleTitle`/
`source`/`salaryMin`/`salaryMax` from pasted JD text, validated against
`jdParseResultSchema`. Powers the "Analyze with AI" button in
`application-form.tsx`.

## "Analyze with AI" — `web/src/hooks/use-analyze-with-ai.ts`

Calls `jd-parse` and `fit-score` concurrently via `Promise.all`, and each
call resolves to its own `{ ok, data | error }` result rather than
throwing — a missing resume (422 from `fit-score`) must not prevent
`jd-parse`'s independent result from populating the form, and vice versa.
`application-form.tsx`'s `handleAnalyze` uses the `jdParse` half to
autofill company/role/source/salary, and renders the `fitScore` half
inline as an early signal before the application is even saved.

## The frontend's typed client — `web/src/lib/api-client.ts`

`hc<AppType>(apiBaseUrl, { headers: getApiHeaders })`, where `apiBaseUrl`
is `VITE_API_URL` or `/api`. Because `hc()` is generic over the *type* of
the server's Hono app, every call (`apiClient.applications.$get()`,
`.applications[":id"].$patch(...)`) is checked against the real route
definitions at compile time — the same category of guarantee tRPC gives
you, with zero codegen step. Falls back to `/api` for local dev, where
Vite's dev server proxies `/api/*` to the Hono server on `:3001` (see
`vite.config.ts`), avoiding CORS entirely in development.

`getApiHeaders` is called fresh on every request (not captured once at
module load): when `VITE_AUTH_ENABLED` is set, it reads the *current*
Supabase session's access token each time, since a static header would go
stale the moment the token refreshes or the user signs out. When auth is
disabled, it falls back to the static `VITE_API_TOKEN` (matching the
API's `requireApiToken` gate) if set, or no header at all. This same
function is also exported for `use-resume.ts`'s resume upload — the one
request `hc<AppType>()` can't type-safely express, since `PUT /resume`
reads a multipart body via `c.req.parseBody()` directly with no Zod
validator to infer a body type from.

## Query hooks — `web/src/hooks/use-applications.ts`

Thin TanStack Query wrappers (`useApplications`, `useCreateApplication`,
`useUpdateApplication`, `useDeleteApplication`) around the typed client.
Every mutation invalidates the `["applications"]` query key on success, so
the list re-fetches automatically after any write — the same
invalidate-on-mutate pattern `use-resume.ts`, `use-application-fit-score.ts`,
and `use-fit-score-all.ts` all follow for their own writes.

## Auth session state — `web/src/lib/supabase-client.ts`, `hooks/use-session.ts`, `components/login-screen.tsx`

`supabase-client.ts` only constructs a Supabase client when
`VITE_AUTH_ENABLED=true`; otherwise it's `null`, so no deployment is
forced to have a Supabase project configured just to boot. `useSession`
tracks the current session (`supabase.auth.getSession()` plus an
`onAuthStateChange` subscription), and is `{ session: null, isLoading:
false }` forever when auth is disabled. `App.tsx` gates the whole app on
this: while `authEnabled && isLoading` it renders nothing, and while
`authEnabled && !session` it renders `LoginScreen` instead of the
application UI. `LoginScreen` only ever calls
`supabase.auth.signInWithPassword` — there's no self-service signup; see
the Auth section in `README.md` for how accounts get created.

## UI primitives — `web/src/components/ui/`

Hand-authored shadcn/ui components (`Button`, `Card`, `Input`, `Badge`) —
the CLI hung in the original sandboxed dev environment (a registry-fetch
issue), so these were written by hand to match what the CLI would have
generated, using the same `cva` variant pattern and the shared `cn()`
helper (`clsx` + `tailwind-merge`) in `web/src/lib/utils.ts`.

## The discriminated union as UI — `status-badge.tsx` / `application-card.tsx`

This is where the data model decision pays off visibly, not just
type-theoretically. `StatusBadge` switches on `status.stage`, and
TypeScript narrows the type per-branch — `status.interviewRound` only
type-checks inside the `"interview"` case, `status.offerAmount` only inside
`"offer"`. Editing a card's stage lives inside `application-card.tsx`'s
`ApplicationCardEditor`; its `defaultStatusFor()` is the one function that
*must* be updated whenever a new stage is added to the union, and the
compiler enforces it — the return type is `ApplicationStatus`, not `any`,
so a missing required field for some stage is a compile error, not a
runtime surprise.

Editing and deleting are both native `<dialog>` modals
(`ApplicationEditDialog`, `DeleteApplicationDialog`), not inline
list-item state — each opens via `showModal()`, closes on Escape/backdrop
click/its own Cancel button, and returns focus to the card's Edit/Delete
icon button it was opened from (`requestAnimationFrame` + a
`data-edit-application`/`data-delete-application` query on the card ref),
so closing a dialog doesn't strand keyboard focus on a removed element.

## The CRUD surface — `application-form.tsx` / `application-list.tsx` / `application-card.tsx` / `App.tsx`

`ApplicationForm` is the create form (plus "Analyze with AI", above).
`ApplicationList` renders one `ApplicationCard` per application, tracking
which single card is currently in edit mode (`editingId` state, so at most
one `ApplicationEditDialog` is ever open). Each `ApplicationCard` shows
`StatusBadge`, its fit score/rationale if scored, a `FitScoreButton`
(re-scores that one card against the current resume; disabled with a
tooltip explaining why when there's no JD or no resume yet — see
`fit-score-button.tsx`), and the edit/delete icon buttons that open the
dialogs above. `App.tsx` composes the auth gate, `ResumeAndScoreStrip`,
`ApplicationForm`, and `ApplicationList`, in that order.

## Resume upload + batch scoring — `web/src/components/resume-and-score-strip.tsx`

One strip, rendered above the create form, doing two related but distinct
jobs: resume upload/replace/remove (via `use-resume.ts`'s
`useResumeStatus`/`useUploadResume`/`useDeleteResume`, with its own
confirm-remove `<dialog>` since removing clears every cached score), and a
single "Score applications" button that calls `fit-score-all` for every
application at once. The button's own disabled/label state comes from
`useFitScoreAllStatus` (`GET /fit-score-all`) — "Upload a resume..." when
there's no resume, "Scores up to date" (with a checkmark, disabled) when
`scoreableCount` is `0`, or the actionable "Score applications" label
otherwise — so it's never left simply clickable-but-uninformative about
why nothing would happen.

## The sandbox seed script — `api/scripts/seed.ts`

Inserts 6 sample applications (one per stage) via the *real*
`createApplication` repo function — never a hand-rolled `INSERT` — so seed
data is validated through the same Zod schemas as real writes and can never
silently drift out of shape. Guarded behind `ALLOW_SEED_RESET=true`: in one
transaction, it clears both the `applications` and `resume` tables (so a
reset always starts from an empty resume too, matching "nothing scored
until a resume is uploaded"), then reseeds — refusing to run at all
unless `ALLOW_SEED_RESET=true` is explicitly set, to prevent an accidental
run against a real database.
