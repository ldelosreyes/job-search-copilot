import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Extends the app's own vite.config.ts (same aliases, same React plugin)
// rather than duplicating it, so component tests resolve "@/..." imports
// identically to how the app itself resolves them.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      exclude: ["e2e/**", "node_modules/**"],
    },
  }),
);
