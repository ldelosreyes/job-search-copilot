-- Resume table: a singleton row holding the sandbox's current resume
-- text, extracted server-side from an uploaded PDF/DOCX. Used by
-- /fit-score and /fit-score-all (see
-- docs/superpowers/specs/2026-07-23-llm-integration-design.md) to
-- compare against tracked applications' JDs.
--
-- `id integer primary key check (id = 1)` enforces "at most one row"
-- at the schema level, not just by app-code convention — an upsert on
-- id = 1 is the only way to ever have a row here.

create table if not exists resume (
  id integer primary key check (id = 1),
  filename text not null,
  content text not null,
  updated_at timestamptz not null default now()
);

comment on table resume is
  'Singleton row holding the public sandbox''s current resume text. Starts empty (no row) after every reset; a visitor or the sandbox owner uploads one to use the fit-score features.';
