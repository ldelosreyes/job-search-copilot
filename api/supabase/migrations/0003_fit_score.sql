-- Persisted, staleness-aware fit scoring. Scores live on the
-- applications row itself (not a separate ephemeral result) so a
-- ranked view is just "read the applications, sort by fit_score" —
-- no second data source to keep in sync.
--
-- fit_score_fingerprint is a hash of (jd_text, role_title,
-- resume.updated_at) at the moment this row was last scored. Comparing
-- it against a freshly computed fingerprint is how the batch endpoint
-- decides what actually needs re-scoring: a JD/title edit changes the
-- first two inputs, and a resume replacement changes the third, so
-- either one correctly invalidates the cached score without a separate
-- "stale" flag to keep in sync by hand.

alter table applications
  add column fit_score integer,
  add column fit_rationale text,
  add column fit_scored_at timestamptz,
  add column fit_score_fingerprint text;

comment on column applications.fit_score is
  'Cached 0-100 fit score against the current resume as of fit_scored_at. Null until first scored.';

comment on column applications.fit_score_fingerprint is
  'Hash of (jd_text, role_title, resume.updated_at) at last scoring — a mismatch against the current values means the cached score is stale.';
