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
