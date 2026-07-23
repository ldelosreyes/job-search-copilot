/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Deployed API origin (e.g. https://job-search-copilot-api-sandbox.vercel.app). Falls back to "/api" (Vite's dev proxy) when unset. */
  readonly VITE_API_URL?: string;
  /** Static shared-secret token sent as `Authorization: Bearer`, matching the API's requireApiToken middleware. Sandbox-only gate, not real per-user auth. */
  readonly VITE_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
