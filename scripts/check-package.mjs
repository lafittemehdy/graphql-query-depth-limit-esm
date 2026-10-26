import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const npmCli = [
	process.env.npm_execpath,
	...(process.env.PATH ?? "")
		.split(delimiter)
		.flatMap((directory) => [
			join(directory, "node_modules/npm/bin/npm-cli.js"),
			join(directory, "../lib/node_modules/npm/bin/npm-cli.js"),
		]),
].find((candidate) => candidate?.endsWith("npm-cli.js") && existsSync(candidate));
assert(npmCli, "Cannot locate npm-cli.js on PATH.");

function npm(args, cwd) {
	return execFileSync(process.execPath, [npmCli, ...args], {
		cwd,
		encoding: "utf8",
	});
}

const temporaryRoot = realpathSync(tmpdir());
const scratch = mkdtempSync(join(temporaryRoot, "graphql-depth-package-"));
try {
	// npm 10 returns an array; npm 12 keys results by package name.
	const [packed] = Object.values(
		JSON.parse(
			npm(
				[
					"pack",
					"--ignore-scripts",
					"--foreground-scripts=false",
					"--json",
					"--pack-destination",
					scratch,
				],
				root,
			),
		),
	);
	assert.equal(packed.name, manifest.name);
	assert.equal(packed.version, manifest.version);
	const expectedFiles = [
		"LICENSE",
		"README.md",
		"package.json",
		"dist/index.js",
		"dist/index.cjs",
		"dist/index.d.ts",
		"dist/index.d.cts",
		"dist/index.js.map",
		"dist/index.cjs.map",
	];
	assert.deepEqual(packed.files.map((file) => file.path).sort(), expectedFiles.sort());
	const tarball = join(scratch, packed.filename);

	for (const graphql of ["16.14.2", "17.0.2"]) {
		const consumer = join(scratch, `graphql-${graphql}`);
		mkdirSync(consumer);
		writeFileSync(
			join(consumer, "package.json"),
			JSON.stringify({
				private: true,
				type: "module",
				dependencies: { [manifest.name]: `file:${tarball}`, graphql },
				devDependencies: {
					typescript: manifest.devDependencies.typescript,
					"@types/node": manifest.devDependencies["@types/node"],
				},
			}),
		);
		npm(
			["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"],
			consumer,
		);
		for (const fixture of ["package-esm.mts", "package-commonjs.cts"]) {
			copyFileSync(join(root, "type-tests", fixture), join(consumer, fixture));
		}
		writeFileSync(
			join(consumer, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					module: "NodeNext",
					moduleResolution: "NodeNext",
					target: "ES2022",
					strict: true,
					noEmit: true,
					types: ["node"],
				},
				include: ["*.mts", "*.cts"],
			}),
		);
		execFileSync(
			process.execPath,
			[join(consumer, "node_modules/typescript/bin/tsc"), "-p", consumer],
			{ stdio: "inherit" },
		);
		const checks = `
const { depthLimit, ERROR_CODES } = api;
assert.deepEqual(Object.keys(api).sort(), ["ERROR_CODES", "depthDirectiveTypeDefs", "depthLimit", "isUnsafeRegExp"]);
assert.equal(typeof api.isUnsafeRegExp, "function");
const schema = buildSchema(api.depthDirectiveTypeDefs + " type Query { user: User } type User { name: String friends: [User] @depth(max: 1) }");
assert.deepEqual(validate(schema, parse("{ user { name } }"), [...specifiedRules, depthLimit(1)]), []);
const deep = parse("query Q { left: user { friends { name } } right: user { friends { name } } }");
const [error] = validate(schema, deep, [depthLimit(1)]);
assert.equal(error.extensions.code, ERROR_CODES.QUERY_TOO_DEEP);
assert.deepEqual(error.extensions.path, ["left", "friends"]);
const [nodeError] = validate(schema, parse("{ user { name } }"), [depthLimit(5, { maxNodes: 1 })]);
assert.equal(nodeError.extensions.code, ERROR_CODES.NODE_LIMIT_EXCEEDED);
assert.equal(nodeError.extensions.nodeCount, 2);
const operations = parse("query A { user { name } } query B { user { name } }");
let callbackCalled = false;
const errors = validate(schema, operations, [depthLimit(0, () => { callbackCalled = true; })], { maxErrors: 1 });
assert.equal(errors.length, 2);
assert.match(errors[1].message, /error limit reached/);
assert.equal(callbackCalled, false);
validate(schema, operations, [depthLimit(5, depths => assert.deepEqual(depths, { A: 1, B: 1 }))]);
const directiveErrors = validate(schema, parse("{ user { friends { friends { name } } } }"), [depthLimit(5, { useDirective: true })]);
assert.equal(directiveErrors[0].extensions.maxDepth, 2);
`;
		for (const extension of ["mjs", "cjs"]) {
			const imports =
				extension === "mjs"
					? `import assert from "node:assert/strict"; import * as api from "${manifest.name}"; import { buildSchema, parse, specifiedRules, validate } from "graphql";`
					: `const assert = require("node:assert/strict"); const api = require("${manifest.name}"); const { buildSchema, parse, specifiedRules, validate } = require("graphql");`;
			const script = join(consumer, `check.${extension}`);
			writeFileSync(script, imports + checks);
			execFileSync(process.execPath, [script], { cwd: consumer, stdio: "inherit" });
		}
		console.log(
			`Packed ${manifest.name}@${manifest.version}: GraphQL ${graphql}, ESM/CJS runtime and declarations passed.`,
		);
	}
} finally {
	assert.equal(dirname(scratch), temporaryRoot);
	rmSync(scratch, { recursive: true, force: true });
}
