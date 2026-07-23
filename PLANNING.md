# Planning notes

Written before implementation, as the scoping pass for this project.
Kept afterward as a record of what was decided and why — the goal is to
be able to explain every choice below in an interview, not just point at
working code.

## Context

Built in response to a real job description (AI Engineer / Senior Full
Stack Developer, Perth) that named a specific stack: React 19, TanStack,
Tailwind v4, shadcn/ui, Hono on Bun monorepo, Postgres/Supabase, Vercel,
Trigger.dev, Langfuse. The goal of this project is narrower than "learn
that stack" — it's to produce a small, honest, explainable artifact that
proves current fluency, in a few days, not weeks.

## Domain choice: a job application tracker

Chosen over a generic demo (todo app, JSON viewer) because:
- It's dogfooded — I'm actually using it during this job search, which
  makes it possible to talk about *why* it works a certain way, not just
  recite what it does.
- It naturally needs a typed API + Postgres + a UI with real state
  transitions (application stages), which maps onto the essential
  requirements without inventing artificial complexity.

## Stack decisions, tiered

**Included, non-negotiable (maps to Essential requirements):**
- React 19, TypeScript with real depth (discriminated unions, generics)
- Zod for runtime validation at the API boundary
- Hono on Bun for the API layer
- Postgres via Supabase
- GitHub Actions CI/CD
- Vercel deploy

**Included, cheap and directly named in the PD:**
- TanStack Query — fetching/mutations
- Tailwind v4 — CSS-first config, no `tailwind.config.js`
- shadcn/ui — copied-in components (`Button`, `Card`, `Input`, `Badge`),
  not an npm dependency; chosen because it's a literal stack match and
  the CLI-vs-hand-authored components are functionally identical, so the
  cost was low once Tailwind v4 was confirmed compatible

**Deliberately deferred, not forgotten:**
- **TanStack Router** — a single-page app with local state doesn't need
  a router yet. Adding one now would be complexity for its own sake.
- **Trigger.dev** — a real fit (e.g. "flag stale applications with no
  update in N days") but it's an extra service to wire up and debug.
  Only worth adding once the core CRUD is solid and there's time left
  over — reaching for it too early risks a half-finished feature instead
  of a solid core.
- **Langfuse** — needs an actual LLM call to trace. Nothing to observe
  until Phase 4 exists.
- **AI/LLM features** (JD parsing, resume-fit scoring via embeddings) —
  Phase 4, and intentionally not part of the days-long v1. Building it
  later reuses the same Supabase + pgvector pattern already planned for
  a separate, larger portfolio project (a RAG assistant), so it isn't
  wasted scope — it's just sequenced after the thing that actually
  needed to ship first: proof of current React/TypeScript fluency for a
  live application already in process.

**Phased roadmap after v1** — each phase is sequenced deliberately after
the one before it is solid, not built in parallel with it:
- **Phase 2 — automated tests.** No test suite exists yet; typecheck,
  lint, and a CI boot smoke-test are the only automated checks today.
  Planned: Vitest unit tests for the Zod schemas (the discriminated
  union is exactly the kind of logic that benefits from a regression
  test), plus a couple of Playwright E2E tests for the core
  create/update/delete flow, wired into the existing CI workflow.
- **Phase 3 — auth for the production (personal-use) environment.** The
  public sandbox deployment intentionally has no auth (seeded fake
  data, nothing to protect). The separate production environment — the
  one actually used to track real applications — needs a real login
  screen backed by Supabase Auth (email/password, real sessions), not
  a shared-secret token. Still single-user: one account, not user
  management. **Multi-user support and an admin dashboard were
  considered and explicitly dropped** — this project's scope is a
  personal tool proving fluency for a specific job search, not a
  multi-tenant product, and that kind of scope has no natural finish
  line — the same reasoning behind deferring Trigger.dev and Langfuse
  above.
- **Phase 4 — LLM/AI integration.** JD parsing, resume-fit scoring via
  embeddings, described above.

The point of listing what's deferred, not just what's built, is that
scoping — deciding what *not* to build yet — is itself part of what a
senior engineer using AI tools well is expected to demonstrate, not an
afterthought to apologize for.

## Data model decision: discriminated union for status

Considered a flat `status: string` column with nullable
stage-specific fields (`interview_round`, `offer_amount`, etc. all on the
same row). Rejected because:
- Every stage-specific field becomes optional on every row regardless of
  stage, so nothing stops a "rejected" row from having an `offer_amount`.
- The UI would need to manually keep "what fields make sense for this
  status" in sync with the backend's assumptions, duplicating logic.

Instead, `status` is a single `jsonb` column validated in application
code as a Zod discriminated union on a `stage` key. TypeScript narrows
the type automatically once `stage` is checked (`status.stage ===
"interview"` gives you `status.interviewRound` with no cast), and the
same union drives which fields the `StageEditor` component renders.

## AI-assisted development notes

Built with Claude Code, following a scope-first approach: each layer
(schemas, db, routes, then UI) was planned before generating code, and
diffs were reviewed rather than accepted wholesale. Two concrete
decisions worth naming:

- The `shadcn` CLI hung in the sandboxed dev environment used to build
  this (likely a registry-fetch/prompt issue with a restricted network).
  Rather than keep retrying, the components were hand-authored to match
  what the CLI would have generated (`components.json`, `cn()` util,
  `cva`-based variants) — a case of redirecting the tool rather than
  fighting it or silently working around it.
- The initial Vercel deploy config was written as a single hybrid
  `vercel.json` at the repo root. On review, this was wrong for a
  Bun-workspace monorepo containing one static site and one serverless
  API — Vercel's zero-config detection doesn't cleanly support that
  shape from a single project root. It was corrected to two independent
  Vercel projects, each with `vercel.json` scoped to its own package and
  a distinct Root Directory setting.
