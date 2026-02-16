import { defineConfig } from "tsup";

export default defineConfig({
	clean: true,
	dts: true,
	entry: ["src/index.ts"],
	external: ["graphql"],
	format: ["cjs", "esm"],
	outDir: "dist",
	sourcemap: true,
	target: "es2022",
});
