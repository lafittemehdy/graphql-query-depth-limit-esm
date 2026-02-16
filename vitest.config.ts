import { defineConfig } from "vitest/config";

export default defineConfig({
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
