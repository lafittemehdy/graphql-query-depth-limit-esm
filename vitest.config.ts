import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    dedupe: ["graphql"],
  },
  test: {
    coverage: {
      exclude: ["dist", "**/*.test.ts", "**/__tests__/**"],
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    environment: "node",
    exclude: ["**/dist/**", "**/node_modules/**"],
    globals: true,
  },
});
