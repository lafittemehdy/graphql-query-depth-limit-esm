import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		// Match Node's entry so external servers and tested code share one GraphQL instance.
		alias: [{ find: /^graphql$/, replacement: fileURLToPath(import.meta.resolve("graphql")) }],
	},
	test: {
		coverage: {
			exclude: ["dist/**", "examples/**", "tsup.config.ts", "vitest.config.ts"],
			provider: "v8",
			reporter: ["html", "json", "text"],
			thresholds: {
				branches: 85,
				functions: 100,
				lines: 93,
				statements: 93,
			},
		},
	},
});
