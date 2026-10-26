import { buildSchema, parse, specifiedRules, validate } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { analyzeQuery } from "../../examples/visualization/src/lib/analysis-engine.js";
import { depthLimit } from "../depth-limit.js";

const schema = buildSchema("type Query { user: User } type User { name: String friends: [User] }");
const twoOperations = parse("query A { user { name } } query B { user { friends { name } } }");
const demoOptions = {
	maxDepth: 0,
	ignore: [] as string[],
	ignoreIntrospection: "typename" as const,
};

describe("validation integration regressions", () => {
	it.each([0, 1])("returns GraphQL errors when maxErrors is %s", (maxErrors) => {
		const callback = vi.fn();
		const errors = validate(schema, twoOperations, [...specifiedRules, depthLimit(0, callback)], {
			maxErrors,
		});
		expect(errors).toHaveLength(maxErrors + 1);
		expect(errors.at(-1)?.message).toContain("error limit reached");
		expect(errors.slice(0, -1).every((error) => error.extensions.code === "QUERY_TOO_DEEP")).toBe(
			true,
		);
		expect(callback).not.toHaveBeenCalled();
	});

	it("respects the default 100-error cap", () => {
		const document = parse(
			Array.from({ length: 101 }, (_, index) => `query Q${index} { user { name } }`).join("\n"),
		);
		const errors = validate(schema, document, [depthLimit(0)]);
		expect(errors).toHaveLength(101);
		expect(errors.at(-1)?.message).toContain("error limit reached");
	});

	it("keeps other validation rules active and reports complete callback depths", () => {
		const callback = vi.fn();
		const errors = validate(schema, parse("query Q { user { missing } }"), [
			...specifiedRules,
			depthLimit(5, callback),
		]);
		expect(errors).toHaveLength(1);
		expect(errors[0]?.message).toContain('Cannot query field "missing"');
		expect(callback).toHaveBeenCalledExactlyOnceWith({ Q: 1 });
		validate(schema, twoOperations, [depthLimit(5, callback)]);
		expect(callback).toHaveBeenLastCalledWith({ A: 1, B: 2 });
	});

	it("reports the first aliased selection before its siblings", () => {
		const errors = validate(schema, parse("{ left: user { name } right: user { name } }"), [
			depthLimit(0),
		]);
		expect(errors[0]?.extensions.path).toEqual(["left"]);
	});

	it("visits a fragment before the following sibling", () => {
		const document = parse(`
			{ user { ...First later: friends { name } } }
			fragment First on User { early: friends { name } }
		`);
		const errors = validate(schema, document, [depthLimit(1)]);
		expect(errors[0]?.extensions.path).toEqual(["user", "early"]);
	});

	it("short-circuits before evaluating ignore rules on later siblings", () => {
		const ignore = vi.fn(() => false);
		validate(schema, parse("{ user { friends { name } } user { name } }"), [
			depthLimit(1, { ignore }),
		]);
		expect(ignore).toHaveBeenCalledTimes(2);
	});

	it("gives each operation its own expanded-node budget", () => {
		const callback = vi.fn();
		const document = parse(
			"query A { ...F } query B { ...F } fragment F on Query { user { name } }",
		);
		expect(validate(schema, document, [depthLimit(5, { maxNodes: 3 }, callback)])).toEqual([]);
		expect(callback).toHaveBeenCalledExactlyOnceWith({ A: 1, B: 1 });
		const errors = validate(schema, document, [depthLimit(5, { maxNodes: 2 })]);
		expect(errors.map((error) => error.extensions)).toEqual([
			{ code: "NODE_LIMIT_EXCEEDED", maxNodes: 2, nodeCount: 3 },
			{ code: "NODE_LIMIT_EXCEEDED", maxNodes: 2, nodeCount: 3 },
		]);
	});
});

describe("visualization regressions", () => {
	it("reports the operation name rather than its root field", () => {
		const result = analyzeQuery("query Named { user { name } }", { ...demoOptions });
		expect(result.violation?.operationName).toBe("Named");
	});

	it("allocates distinct names without overwriting explicit or anonymous operations", () => {
		const result = analyzeQuery(
			`
			query Q { user { name } }
			query Q { user { friends { name } } }
			query Q_1 { user { name } }
			{ user { name } }
			{ user { friends { name } } }
		`,
			{ ...demoOptions },
		);
		expect(result.callbackPayload).toEqual({
			Q: 1,
			Q_2: 2,
			Q_1: 1,
			"[anonymous]": 1,
			"[anonymous:2]": 2,
		});
		expect(result.operations.map((operation) => operation.name)).toEqual([
			"Q",
			"Q_2",
			"Q_1",
			"[anonymous]",
			"[anonymous:2]",
		]);
		expect(new Set(result.tree?.map((root) => root.fieldName)).size).toBe(5);
	});

	it("preserves field, fragment, and inline-fragment order in the tree", () => {
		const result = analyzeQuery(
			`
			query Q { user { first: name ...F ... on User { third: name } last: name } }
			fragment F on User { second: name }
		`,
			{ ...demoOptions, maxDepth: 5 },
		);
		const children = result.tree?.[0]?.children[0]?.children;
		expect(children?.map((node) => node.alias ?? node.fieldName)).toEqual([
			"first",
			"...F",
			"... on User",
			"last",
		]);
		expect(children?.[1]?.children[0]?.alias).toBe("second");
	});
});
