import { defineConfig, devices } from "@playwright/test";

/**
 * Assumes both the API (:3001) and web dev server (:5173) are already
 * running — CI starts them explicitly before this runs, matching how a
 * developer would test locally (bun run dev). No webServer config here,
 * since coordinating two servers (API + its DB, then web's dev proxy to
 * the API) is clearer done explicitly in the CI workflow than folded
 * into Playwright's own single-webServer lifecycle.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
