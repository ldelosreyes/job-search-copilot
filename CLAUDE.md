# Job Search Copilot — Claude Code project instructions

## What this is

A job-application tracker built as a portfolio piece for AI Engineer job
applications — specifically to demonstrate current React 19/TypeScript
fluency and stack overlap with a real job description (see
`PLANNING.md` for the full scoping rationale). The person you're working
with is a 12+ year full-stack engineer, strong in TypeScript/Vue/Laravel/
AWS. They used React professionally from 2020-2022 before their current
role — it's not new to them, but this project is meant to demonstrate
current React 19 fluency and depth with the rest of this specific stack
(Hono, TanStack, Supabase), which are newer to them. They want to fully
understand every part of what gets built — treat this like pairing with
someone experienced who is deliberately learning the new pieces, not
someone who needs the basics explained.

Read `README.md` and `PLANNING.md` before starting work — they contain
the architecture, the stack-tiering decisions (what's in scope for v1 vs.
deliberately deferred), and the reasoning behind the discriminated-union
data model.

## Workflow requirements (non-negotiable for this project)

**Explain before and after every non-trivial change.** Before writing
code for a feature or fix, state in 2-4 sentences: what you're about to
do, why this approach over alternatives you considered, and which files
it touches. After, briefly note anything that turned out differently
than planned. Skip this preamble only for trivial one-line fixes (typos,
import ordering).

**Work in small, reviewable increments.** One logical change per round —
don't bundle "add the feature" with "also refactor this unrelated thing"
in the same pass. If a task naturally splits into stages (schema ->
migration -> route -> UI), do them as separate steps with a chance to
review between each, not all at once.

**Commit after every logical unit of work, not at the end of a session.**
- One commit per coherent change (a feature, a fix, a refactor) —
  don't bundle unrelated changes into one commit.
- Write commit messages that explain the *why*, not just the *what*
  (e.g. `Add Zod validation to salary fields — API was accepting
  negative salaries` not `update schema`).
- Before committing, show the diff summary and a one-line description of
  what's about to be committed, and wait for confirmation rather than
  committing silently — this project intentionally prioritizes visibility
  into the git history over speed.
- Never use `git commit --amend` or force-push on shared history without
  asking first.

**Stay in default permission mode for this project** (not
`acceptEdits`/`bypassPermissions`) unless explicitly told otherwise for a
specific session — the person wants to see and approve individual edits,
not have them auto-applied.

**When you're not sure between two reasonable approaches, ask instead of
picking silently.** This project's whole point is that every decision
should be something the person can explain in an interview — a choice
made without their input undermines that, even if it's technically fine.

## Stack (see PLANNING.md for the full tier reasoning)

- `api/`: Hono on Bun, Zod validation, Postgres via `postgres.js`,
  deployed as a Vercel serverless function (`api/index.ts` adapter)
- `web/`: React 19, Vite, TanStack Query, Tailwind v4 (CSS-first config,
  no `tailwind.config.js`), shadcn/ui (hand-authored components, see
  `components.json` — the CLI hangs in some sandboxed environments, so
  don't assume `npx shadcn add` will work first try; fall back to
  hand-authoring matching the existing pattern in `src/components/ui/`
  if it hangs)
- Bun workspace monorepo (`workspaces: ["api", "web"]` in root
  `package.json`)

## Commands

```bash
bun install              # from repo root
bun run dev:api           # localhost:3001
bun run dev:web           # localhost:5173
bun run typecheck         # both packages
bun run lint              # both packages
bun run --cwd web build   # production build
```

## Current state

Core CRUD (applications: create/list/update/delete, discriminated-union
status with a stage-specific `StageEditor` UI) is built and was verified
end-to-end against a real local Postgres instance. Not yet done: real
Supabase project wiring (currently only tested against local Postgres),
live Vercel deployment, and any Phase 2 AI/LLM features (deliberately
deferred — see `PLANNING.md`).
