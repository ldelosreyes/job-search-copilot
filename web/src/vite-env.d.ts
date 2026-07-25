/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Deployed API origin (e.g. https://job-search-copilot-api-sandbox.vercel.app). Falls back to "/api" (Vite's dev proxy) when unset. */
  readonly VITE_API_URL?: string;
  /** Static shared-secret token sent as `Authorization: Bearer`, matching the API's requireApiToken middleware. Sandbox-only gate, not real per-user auth. */
  readonly VITE_API_TOKEN?: string;
  /** Gates the whole app behind a login screen, matching the API's AUTH_ENABLED toggle. Requires VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY when "true". */
  readonly VITE_AUTH_ENABLED?: string;
  /** Only required when VITE_AUTH_ENABLED=true. Project Settings -> API. The anon/publishable key — safe to ship publicly, RLS is what actually protects the data (see 0004_enable_rls.sql). */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
