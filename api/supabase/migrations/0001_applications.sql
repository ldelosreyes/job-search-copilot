-- Applications table: one row per job application being tracked.
-- `status` is stored as jsonb to hold the discriminated-union shape
-- (see api/src/schemas/application.ts) rather than being spread across
-- a dozen nullable columns.

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  role_title text not null,
  source text not null check (source in ('recruiter', 'direct', 'referral', 'job_board', 'other')),
  salary_min integer,
  salary_max integer,
  jd_text text,
  notes text,
  status jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fast lookups by stage without unpacking the jsonb on every query,
-- e.g. "show me everything currently in interview".
create index if not exists applications_status_stage_idx
  on applications ((status ->> 'stage'));

create index if not exists applications_created_at_idx
  on applications (created_at desc);

comment on table applications is 'Job applications tracked by the Job Search Copilot app.';
comment on column applications.status is
  'Discriminated union: {stage, ...stage-specific fields}. Validated in app code via Zod, not a DB constraint, since stage-specific shape checks are awkward in plain SQL.';
