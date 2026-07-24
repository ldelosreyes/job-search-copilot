# e2e test organization

One spec file per feature/route area, named after what it covers —
`applications.spec.ts` for the applications CRUD flow, and (as Phase 4
lands) `resume.spec.ts`, `jd-parse.spec.ts`, `fit-score.spec.ts`,
`fit-ranking.spec.ts` following the same pattern.

Positive and negative cases for a feature live together in the same
file (and usually the same `test.describe` block), not split into
separate happy-path/error-path files — a "does this feature work"
question is best answered by reading its expected-success and
expected-failure behavior side by side, not in two different places.

Split a file further only once it's actually grown unwieldy for a
single feature, not preemptively.
