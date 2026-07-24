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
- The project owner (or a visitor trying the demo end-to-end) can rank
  their current resume against **every** tracked application that has
  a JD, in one action, instead of checking fit one application at a
  time.

## Non-goals

- Persisting AI results onto `applications` rows, including
  `fit-score-all` results (re-run on click instead — see Architecture
  below).
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
- **`POST /fit-score-all`** — no body. Reads the current resume
  server-side, and every `applications` row with a non-null `jd_text`,
  most-recently-created first, capped at 25. **One Gemini call**, not
  N — the prompt lists the resume once plus each capped application's
  `id`/`company`/`roleTitle`/`jdText` (each `jdText` truncated to
  ~3,000 chars), and asks for a JSON array of
  `{ applicationId, score (0-100), rationale }`, one entry per
  application sent, validated against a Zod array schema. Response:
  `{ results: [...], consideredCount: number, skippedCount: number }`
  — `results` sorted by `score` descending; `skippedCount` is
  applications with no `jd_text` plus any beyond the cap of 25.

  **Rejected alternative: loop `/fit-score` once per application.**
  Same end result for the visitor, but it multiplies Gemini calls 1:1
  with however many applications are tracked — directly fighting the
  per-IP rate limit sized for "one visitor, one action" (see
  Guardrails). Batching into a single call keeps this endpoint at
  exactly one Gemini call regardless of how many JDs are being
  compared, same shape as `/fit-score` and `/jd-parse`.

  **Cap of 25, not unbounded:** bounds worst-case prompt size and
  `maxOutputTokens` the same way the ~5,000-char cap on `/fit-score`
  does for a single JD. In practice a personal application tracker
  rarely holds more than a few dozen open applications at once, so 25
  covers the realistic case; if it's ever exceeded, `skippedCount`
  makes the truncation visible in the UI rather than silently dropping
  rows.

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

**Auth**: all five new routes sit behind the exact same
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
- **`/fit-score-all` gets its own, tighter limit** (e.g. 2
  requests/IP/10min) — its Gemini call carries a much larger prompt
  and output than the other three routes, so it costs more per call
  even though it's still exactly one call.
- **Input caps**: `jdText` capped ~5,000 chars (Zod), resume upload
  capped ~2MB — rejected before ever reaching Gemini or the parsing
  libraries. `/fit-score-all` additionally caps at 25 applications
  and ~3,000 truncated chars of `jdText` per application (see
  Architecture) — the batched-prompt equivalent of the same
  bounded-input principle.
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

## Frontend: Resume Fit ranking view

A new view, reachable via a "Resume Fit" tab/link in the existing
top-level navigation, separate from the "New application" form where
the single-JD `/fit-score` action lives — ranking is a distinct task
from checking fit while filling out one form, not a variant of it.

**Layout, top to bottom:**

1. **Resume status strip** — reuses `GET /resume`: "Current resume:
   `resume.pdf` · updated 3 hours ago" with a small "Replace" control,
   or, if none uploaded, an inline upload prompt (same component as
   the single-JD flow's empty state — no second upload UI to build).
2. **One primary action**: a single "Score all applications" button.
   No per-row "check this one" buttons and no auto-run-on-load — fits
   the project's existing re-run-on-click pattern (Non-goals) and
   keeps this to exactly one Gemini call per click.
3. **Loading state**: the button becomes a disabled spinner
   ("Scoring N applications…") for the single in-flight request —
   no per-row skeletons, since results only exist once the one batched
   call resolves.
4. **Results table**, sorted by score descending:

   | Company | Role | Fit | |
   |---|---|---|---|
   | Acme Co | Staff Engineer | 🟢 87 — Strong match | ▸ |
   | Globex | Platform Engineer | 🟡 61 — Possible match | ▸ |
   | Initech | Backend Engineer | 🔴 34 — Weak match | ▸ |

   - **Score bucketed into three bands** (Strong ≥75, Possible 50-74,
     Weak <50) with color + label, not a bare 0-100 number — a raw
     cosine-style score reads as meaningless precision to a human
     scanning a list quickly.
   - **Rationale expands inline** on row click (an accordion row, not
     a modal/second page) — keeps the ranked list as the anchor point;
     a modal would fight the "scan and compare" nature of a ranked
     table.
   - Rows link through to the existing application detail/edit view,
     since the point of ranking is deciding what to act on next.
5. **Skipped-applications note**, shown only when `skippedCount > 0`:
   "Showing your 25 most recent applications with a JD · 6 others
   skipped" — visible truncation, not a silent cap (see Guardrails).
6. **Empty states**:
   - No resume yet → the same upload prompt as item 1, button
     disabled until one exists.
   - Resume exists but zero applications have a `jd_text` → "None of
     your tracked applications have a JD yet — add one from the
     applications list to see a fit score here."

**Recompute, not auto-refresh**: results are held in local
component/query-cache state only (React Query, no new persistence —
consistent with the Non-goals decision not to persist AI results).
Re-clicking "Score all applications" re-runs the full batch; there is
no per-application "recompute just this one" affordance, since the
single-JD `/fit-score` flow already covers that case on the
application's own form.

**Why a dedicated view over a column on the existing applications
list** (rejected alternative): a `Fit` column would need every visible
application scored on every list load, silently turning a page view
into a Gemini call — clashing with the "AI features run explicitly on
click" pattern used everywhere else in this spec. A separate view with
one explicit trigger keeps that invariant, at the cost of one extra
click before seeing scores.

## Error handling

| Case | Handling |
|---|---|
| No resume uploaded, `/fit-score` called | 422, clear message; UI shows upload prompt |
| Corrupt/unreadable PDF or DOCX | Parsing library throws → caught → 400 "Couldn't read that file" |
| Gemini returns malformed JSON / fails schema validation | 502-style "AI response was invalid, try again" — not a crash, not garbage rendered |
| Gemini 429 (quota exceeded) | Clean "AI demo temporarily unavailable, try again shortly" |
| `GEMINI_API_KEY` unset | Fail fast at startup with a clear console error — same pattern as `AUTH_ENABLED`/`API_TOKEN` |
| No resume uploaded, `/fit-score-all` called | 422, same upload prompt as `/fit-score` |
| No applications have `jd_text` | 200, `{ results: [], consideredCount: 0, skippedCount: 0 }` — empty state, not an error |
| More than 25 applications have `jd_text` | 200, `skippedCount` reflects the overflow; UI surfaces it as a visible note, not silently dropped |
| Gemini returns a result array that doesn't match the requested application IDs | 502-style "AI response was invalid, try again" — same validate-before-render discipline as the other two endpoints |

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
- **`/fit-score-all` unit tests**: the 25-application cap and
  `skippedCount` computation, the empty-results (no `jd_text` anywhere)
  case, and the mismatched-Gemini-response-shape rejection.
- **`/fit-score-all` E2E**: seed a handful of applications with
  `jd_text`, mock a batched Gemini response, verify the ranked table
  renders sorted by score and the empty state shows correctly when no
  application has a `jd_text` yet.

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
