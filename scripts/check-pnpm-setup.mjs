import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const packageJsonPath = join(rootDir, "package.json");
const workflowsDir = join(rootDir, ".github", "workflows");

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const packageManager = packageJson.packageManager;

if (typeof packageManager !== "string" || !packageManager.startsWith("pnpm@")) {
	process.exit(0);
}

if (!existsSync(workflowsDir)) {
	process.exit(0);
}

const violations = [];

for (const fileName of readdirSync(workflowsDir)) {
	if (!fileName.endsWith(".yml") && !fileName.endsWith(".yaml")) {
		continue;
	}

	const filePath = join(workflowsDir, fileName);
	const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex];
		if (!line || !line.includes("pnpm/action-setup")) {
			continue;
		}

		const stepIndent = line.match(/^(\s*)/)?.[1].length ?? 0;

		for (let cursor = lineIndex + 1; cursor < lines.length; cursor++) {
			const candidate = lines[cursor];
			if (!candidate) {
				continue;
			}

			const trimmed = candidate.trim();
			if (trimmed.length === 0) {
				continue;
			}

			const indent = candidate.match(/^(\s*)/)?.[1].length ?? 0;
			if (indent <= stepIndent && !trimmed.startsWith("#")) {
				break;
			}

			if (/^\s*version\s*:/.test(candidate)) {
				violations.push(`${fileName}:${cursor + 1}`);
			}
		}
	}
}

if (violations.length > 0) {
	console.error(
		[
			"Found pnpm/action-setup version fields while packageManager is set in package.json.",
			"Remove the workflow `with.version` entries to avoid pnpm version conflicts.",
			...violations.map((location) => `- ${location}`),
		].join("\n"),
	);
	process.exit(1);
}
