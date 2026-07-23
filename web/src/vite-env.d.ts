/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Deployed API origin (e.g. https://job-search-copilot-api-sandbox.vercel.app). Falls back to "/api" (Vite's dev proxy) when unset. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
