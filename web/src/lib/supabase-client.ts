import { createClient } from "@supabase/supabase-js";

export const authEnabled = import.meta.env.VITE_AUTH_ENABLED === "true";

/**
 * Only constructed when auth is actually enabled — VITE_SUPABASE_URL/
 * VITE_SUPABASE_ANON_KEY are only required in that case, matching the
 * API's own AUTH_ENABLED-gated requirement for SUPABASE_URL/
 * SUPABASE_ANON_KEY (api/src/middleware/auth.ts). null everywhere else
 * (local dev, and any deployment that never sets VITE_AUTH_ENABLED),
 * so nothing here forces a Supabase project to exist for the common
 * case.
 */
export const supabase = authEnabled
  ? createClient(import.meta.env.VITE_SUPABASE_URL!, import.meta.env.VITE_SUPABASE_ANON_KEY!)
  : null;
