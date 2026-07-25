-- Enables Row Level Security with zero policies on both tables.
--
-- This app's own API connects via DATABASE_URL as the `postgres` role,
-- which has BYPASSRLS (confirmed directly against the live database) —
-- so this has no effect on the app's own direct Postgres access. What
-- it actually does: locks Supabase's auto-generated PostgREST REST/
-- GraphQL API out of these tables for the `anon`/`authenticated`
-- roles. That API is enabled on every table by default whether or not
-- an app uses it, and once SUPABASE_ANON_KEY ships in the web app's
-- public JS bundle (needed for the login screen), anyone could
-- otherwise read/write these tables directly via
-- https://<project>.supabase.co/rest/v1/... — completely bypassing
-- this app's own auth, rate limits, and AI-cost guardrails.
--
-- RLS enabled with no policies is a full default-deny for anon/
-- authenticated, per Supabase's documented behavior — exactly what we
-- want, since all legitimate access already goes through this app's
-- own API, never through Supabase's REST layer directly.

alter table applications enable row level security;
alter table resume enable row level security;
