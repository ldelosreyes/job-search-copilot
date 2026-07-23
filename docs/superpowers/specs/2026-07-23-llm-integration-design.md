# Phase 4: LLM integration — JD parsing + resume-fit scoring

## Context

`PLANNING.md` scoped Phase 4 as "JD parsing, resume-fit scoring via
embeddings," deliberately deferred until Phase 2 (tests) and the
demoability pass were solid. Both are now done (PRs #14-#17). This is
the design for Phase 4 itself.

The feature must live in the **public, no-auth sandbox** — the whole
point of this project is a demo link employers can click — which
means cost and abuse are first-class design constraints, not
afterthoughts. Two decisions came out of discussing that directly with
the project owner:

- **Gemini `gemini-2.5-flash-lite` on the free tier**, prioritizing
  zero direct cost over provider choice. Accepted tradeoff: free-tier
  usage (via AI Studio API keys, not paid Vertex AI) may be used by
  Google to improve their products — acceptable here because the
  sandbox never handles the project owner's real personal data (see
  Resume handling below).
- **No embeddings/pgvector**, despite `PLANNING.md`'s original mention.
  There is only ever one active resume compared against one JD per
  request — vector similarity search only pays off when searching
  across many documents, which isn't the case here. A direct LLM call
  reading both texts is simpler, cheaper, and equally accurate for
  this shape of comparison.

## Goals

- A visitor can paste a JD and a resume (PDF/DOCX) into the public
  sandbox and get two genuinely useful AI results: parsed JD fields
  (pre-filling the application form) and a fit score with rationale.
- Stay within Gemini's free tier under normal demo traffic, with
  guardrails that fail gracefully rather than silently or expensively
  if that tier is ever exceeded or abused.
- No new abstraction beyond what two simple, independent AI actions
  need — this is not an agentic system, not a RAG pipeline, just two
  bounded LLM calls with structured output.

## Non-goals

- Persisting AI results onto `applications` rows (re-run on click
  instead — see Architecture below).
- Any resume storage beyond a single "current sandbox resume" — no
  per-user resumes, no history/versioning.
- Tracking/displaying remaining daily quota in the UI.
- A general "this is a public sandbox" banner covering auth/data
  beyond the AI feature specifically (see Frontend section).

## Architecture

Two independent backend endpoints, called together from a single
frontend action:

- **`POST /jd-parse`** — body `{ jdText: string }` (Zod-validated, max
  ~5,000 chars). One Gemini call, returns parsed fields: `company`,
  `roleTitle`, `salaryMin`/`salaryMax` if mentioned (`null` otherwise,
  matching the existing nullable schema), and a best-guess `source`
  from the existing `applicationSourceSchema` enum — defaults to
  `"other"` when the JD gives no clear signal. Used to pre-fill the
  "New application" form fields.
- **`POST /fit-score`** — body `{ jdText: string }`. Reads the current
  resume server-side (never accepts resume text from the request
  body). One Gemini call, returns `{ score: number (0-100), rationale:
  string }`.
- **`PUT /resume`** — multipart file upload (PDF or DOCX). Extracts
  plain text server-side, upserts the singleton `resume` row.
- **`GET /resume`** — returns `{ filename: string | null, updatedAt:
  string | null }` (never the extracted text) so the UI can show
  "Current resume: `resume.pdf`, updated 3 hours ago" or an empty
  state.

**Two endpoints, not one combined endpoint** (rejected alternative):
keeps each call single-purpose and independently rate-limitable, at
the cost of 2 Gemini calls when a visitor wants both results — an
accepted tradeoff given free-tier cost is already zero.

**Results are not persisted** to `applications` (rejected alternative:
add columns to `applications` for parsed fields / score / rationale).
Persisting would need a schema migration and would go stale silently
if the resume is later replaced without an explicit recompute step.
Re-running the call on click is simpler and the calls are fast/free.

**Frontend UX**: a single "Analyze with AI" button (not two separate
buttons) triggers both calls **in parallel** (`Promise.all`, not
sequential) and shows both results once both resolve — parsed fields
autofill the form, fit score + rationale render below. If the resume
is missing, `/fit-score` rejects with 422 while `/jd-parse` still
succeeds independently — the button's result handling must treat the
two calls as independently succeed/fail-able, not an all-or-nothing
pair.

**Auth**: all four new routes sit behind the exact same
`requireApiToken`/`requireAuth` gate already applied to
`/applications/*` in `api/src/index.ts` — no new auth mechanism.

## Data model

New table, a singleton (always exactly one row or zero rows):

```sql
create table resume (
  id integer primary key check (id = 1),
  filename text not null,
  content text not null,
  updated_at timestamptz not null default now()
);
```

- **Starts empty** (no row) after any reset — no seeded dummy resume.
  The sandbox owner (or any visitor) uploads one to use the fit-score
  feature; nothing works until then, by design.
- `PUT /resume` upserts on `id = 1`.
- Nightly reset (`reset-sandbox.yml`, already existing) is extended to
  also `delete from resume` — same self-healing pattern as the
  applications table, and resolves the "publicly replaceable" privacy
  concern below by bounding exposure to at most ~24h.

**`fit-score` with no resume row** returns 422 with a clear message;
the UI shows an "Upload a resume to check fit" prompt rather than a
disabled or confusing button.

## Guardrails

- **Vercel Firewall rate limit** on `/jd-parse`, `/fit-score`,
  `/resume` specifically — tighter than the existing general API rule
  (e.g. 5 requests/IP/10min as a starting point, staged log → enforce
  the same way the existing rules were rolled out). This is what
  prevents any single visitor from burning the shared daily free-tier
  budget, not a bespoke quota-tracking system.
- **Input caps**: `jdText` capped ~5,000 chars (Zod), resume upload
  capped ~2MB — rejected before ever reaching Gemini or the parsing
  libraries.
- **`maxOutputTokens`** capped on every Gemini call, bounding
  worst-case per-call cost/latency regardless of input.
- **Structured output, validated twice**: `@google/genai`'s Zod-schema
  support constrains the model's output shape at the API level, and
  the response is re-validated against the same Zod schema server-side
  before it ever reaches the client. Never trust the model's output
  shape blindly; never render model output as raw HTML.
- **Graceful quota handling**: Gemini's 429 (free-tier quota exceeded —
  published limits are roughly 15 RPM / 1,000 RPD / 250K TPM for
  `gemini-2.5-flash-lite`, per Google's own rate-limit page, subject to
  change) is caught and mapped to a clean "AI demo temporarily
  unavailable, try again shortly" response. No custom daily-counter
  database — Gemini's own 429 is the source of truth; the Firewall
  rule is what keeps the shared budget from being burned by one
  visitor.
- **Privacy**: uploading a resume to this public sandbox exposes its
  text to every visitor until the next nightly reset. Addressed by
  the disclaimer banner (below) plus the nightly wipe, not by
  restricting who can upload (already decided: publicly replaceable,
  rate-limited).

## Frontend: AI disclaimer banner

A fixed banner pinned to the top of the page, shown only when a new
build-time env var `VITE_SHOW_AI_DISCLAIMER` is set to `true` — same
pattern as the existing `VITE_API_TOKEN`/`VITE_API_URL` flags. Set to
`true` on the sandbox Vercel project; left unset on any future
production deployment, since production won't have this public-upload
exposure.

Copy: something like "Public demo — uploaded resumes are visible to
all visitors and cleared nightly. Don't upload anything sensitive."

Behavior: collapsible via a toggle (chevron/close control) that shrinks
it to a small persistent strip rather than removing it — it can be
tucked away during a demo walkthrough but is never fully dismissible
(no localStorage "seen it, never show again" — every visitor should
see it at least once per session).

Scope: this banner is specifically about the AI/resume feature, not a
general "this sandbox has no auth" banner — that would be a separate,
later decision if ever wanted.

## Error handling

| Case | Handling |
|---|---|
| No resume uploaded, `/fit-score` called | 422, clear message; UI shows upload prompt |
| Corrupt/unreadable PDF or DOCX | Parsing library throws → caught → 400 "Couldn't read that file" |
| Gemini returns malformed JSON / fails schema validation | 502-style "AI response was invalid, try again" — not a crash, not garbage rendered |
| Gemini 429 (quota exceeded) | Clean "AI demo temporarily unavailable, try again shortly" |
| `GEMINI_API_KEY` unset | Fail fast at startup with a clear console error — same pattern as `AUTH_ENABLED`/`API_TOKEN` |

## Testing

- **Unit tests** (`bun test`, existing pattern): Zod schemas for both
  new response shapes, the resume-nullable edge case, input-length
  rejection at the schema layer.
- **Gemini calls are mocked in tests** — no real API calls in CI, kept
  free/fast/deterministic, consistent with this project's existing
  practice of never hitting real external services in the test suite.
- **E2E (Playwright)**: one happy-path test against a mocked/stubbed
  Gemini response verifying UI wiring — analyze button fills the form
  and shows a fit score once a resume is uploaded; the "no resume"
  state shows the upload prompt correctly. Not a real Gemini call in
  CI, same rationale as above.

## New dependencies & config

- `@google/genai` — official current Gemini TS/JS SDK, supports
  Zod-based structured output directly.
- `pdf-parse` and `mammoth` — PDF and DOCX text extraction
  respectively; both are Bun-installable, pure-enough TypeScript
  packages.
- New env var `GEMINI_API_KEY` (backend), documented in
  `api/.env.example` following the existing pattern.
- New env var `VITE_SHOW_AI_DISCLAIMER` (frontend, sandbox-only).
- New Vercel Firewall rule scoped to the three new routes, staged
  log → enforce per the existing rollout practice documented in
  `WALKTHROUGH.md`.
- Nightly `reset-sandbox.yml` extended to also clear the `resume`
  table.
