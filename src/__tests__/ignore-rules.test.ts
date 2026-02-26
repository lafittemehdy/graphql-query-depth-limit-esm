import { parse, validate } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { depthLimit } from "../depth-limit.js";
import { shouldIgnoreField } from "../ignore.js";
import type { DepthLimitOptions } from "../types.js";
import { schema } from "./fixtures.js";

// ---------------------------------------------------------------------------
// Unit tests for shouldIgnoreField
// ---------------------------------------------------------------------------

describe("shouldIgnoreField", () => {
	describe("introspection fields (default: typename mode)", () => {
		it("ignores __typename by default", () => {
			expect(shouldIgnoreField("__typename")).toBe(true);
		});

		it("does not ignore __schema by default", () => {
			expect(shouldIgnoreField("__schema")).toBe(false);
		});

		it("does not ignore __type by default", () => {
			expect(shouldIgnoreField("__type")).toBe(false);
		});

		it("does not ignore regular fields starting with underscore", () => {
			expect(shouldIgnoreField("_private")).toBe(false);
		});
	});

	describe("introspection fields (all mode)", () => {
		it("ignores __typename", () => {
			expect(shouldIgnoreField("__typename", undefined, false, "all")).toBe(true);
		});

		it("ignores __schema", () => {
			expect(shouldIgnoreField("__schema", undefined, false, "all")).toBe(true);
		});

		it("ignores __type", () => {
			expect(shouldIgnoreField("__type", undefined, false, "all")).toBe(true);
		});

		it("does not ignore _private", () => {
			expect(shouldIgnoreField("_private", undefined, false, "all")).toBe(false);
		});
	});

	describe("introspection fields (none mode)", () => {
		it("does not ignore __typename", () => {
			expect(shouldIgnoreField("__typename", undefined, false, "none")).toBe(false);
		});

		it("does not ignore __schema", () => {
			expect(shouldIgnoreField("__schema", undefined, false, "none")).toBe(false);
		});
	});

	describe("string rules", () => {
		it("matches exact field name", () => {
			expect(shouldIgnoreField("metadata", ["metadata"])).toBe(true);
		});

		it("does not match different field name", () => {
			expect(shouldIgnoreField("data", ["metadata"])).toBe(false);
		});

		it("is case-sensitive by default", () => {
			expect(shouldIgnoreField("Metadata", ["metadata"])).toBe(false);
		});

		it("supports case-insensitive matching", () => {
			expect(shouldIgnoreField("Metadata", ["metadata"], true)).toBe(true);
		});
	});

	describe("RegExp rules", () => {
		it("matches pattern", () => {
			expect(shouldIgnoreField("usersConnection", [/Connection$/])).toBe(true);
		});

		it("does not match non-matching pattern", () => {
			expect(shouldIgnoreField("users", [/Connection$/])).toBe(false);
		});

		it("handles stateful regex with /g flag consistently", () => {
			const globalRegex = /Connection$/g;
			expect(shouldIgnoreField("usersConnection", [globalRegex])).toBe(true);
			expect(shouldIgnoreField("usersConnection", [globalRegex])).toBe(true);
			expect(shouldIgnoreField("postsConnection", [globalRegex])).toBe(true);
			expect(shouldIgnoreField("other", [globalRegex])).toBe(false);
			expect(shouldIgnoreField("usersConnection", [globalRegex])).toBe(true);
		});

		it("handles stateful regex with /y flag consistently", () => {
			const stickyRegex = /users/y;
			stickyRegex.lastIndex = 4;
			expect(shouldIgnoreField("usersConnection", [stickyRegex])).toBe(true);
			expect(shouldIgnoreField("usersConnection", [stickyRegex])).toBe(true);
			expect(shouldIgnoreField("postsConnection", [stickyRegex])).toBe(false);
			expect(shouldIgnoreField("usersConnection", [stickyRegex])).toBe(true);
		});
	});

	describe("function rules", () => {
		it("uses custom predicate", () => {
			const rule = (name: string) => name.length > 10;
			expect(shouldIgnoreField("shortName", [rule])).toBe(false);
			expect(shouldIgnoreField("veryLongFieldName", [rule])).toBe(true);
		});
	});

	describe("function rules error handling", () => {
		it("wraps errors from throwing predicates with field context", () => {
			const throwingRule = () => {
				throw new Error("boom");
			};
			expect(() => shouldIgnoreField("myField", [throwingRule])).toThrow(
				'Ignore rule function threw for field "myField": boom',
			);
		});

		it("handles non-Error throws from predicates", () => {
			const throwingRule = () => {
				throw "string error";
			};
			expect(() => shouldIgnoreField("myField", [throwingRule])).toThrow(
				'Ignore rule function threw for field "myField": string error',
			);
		});

		it("does not wrap errors from earlier matching rules", () => {
			const throwingRule = () => {
				throw new Error("should not reach");
			};
			// "myField" matches the string rule first, so the function is never called
			expect(shouldIgnoreField("myField", ["myField", throwingRule])).toBe(true);
		});
	});

	describe("multiple rules", () => {
		it("matches if any rule matches", () => {
			const rules = ["exact", /pattern/, (n: string) => n === "custom"];
			expect(shouldIgnoreField("exact", rules)).toBe(true);
			expect(shouldIgnoreField("pattern123", rules)).toBe(true);
			expect(shouldIgnoreField("custom", rules)).toBe(true);
			expect(shouldIgnoreField("none", rules)).toBe(false);
		});
	});

	describe("frozen or exotic RegExp rules", () => {
		it("includes stringified value when RegExp throws a non-Error", () => {
			const regex = /Connection$/;
			// Override test to throw a non-Error value, covering the
			// String(error) branch in the RegExp error handler.
			regex.test = () => {
				throw "non-error thrown by test";
			};

			try {
				shouldIgnoreField("usersConnection", [regex]);
				expect.fail("should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).name).toBe("IgnoreRuleError");
				expect((error as Error).message).toContain("non-error thrown by test");
			}
		});

		it("works with non-global frozen RegExp (no lastIndex mutation needed)", () => {
			const frozenRegex = Object.freeze(/Connection$/);
			// Non-global frozen regexes are safe because lastIndex is not mutated.
			expect(() => shouldIgnoreField("usersConnection", [frozenRegex])).not.toThrow();
			expect(shouldIgnoreField("usersConnection", [frozenRegex])).toBe(true);
		});

		it("works with unfrozen global RegExp (lastIndex reset succeeds)", () => {
			const globalRegex = /Connection$/g;
			globalRegex.lastIndex = 5;
			expect(shouldIgnoreField("usersConnection", [globalRegex])).toBe(true);
			expect(shouldIgnoreField("usersConnection", [globalRegex])).toBe(true);
		});

		it("wraps error from frozen global RegExp as IgnoreRuleError", () => {
			const frozenRegex = Object.freeze(/Connection$/g);
			try {
				shouldIgnoreField("usersConnection", [frozenRegex]);
				// This line should not be reached because the engine will try to
				// reset .lastIndex on a frozen object, which throws.
				expect.fail("should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).name).toBe("IgnoreRuleError");
				expect((error as Error).message).toContain('field "usersConnection"');
			}
		});

		it("wraps error from frozen sticky RegExp as IgnoreRuleError", () => {
			const frozenRegex = Object.freeze(/users/y);
			try {
				shouldIgnoreField("usersConnection", [frozenRegex]);
				expect.fail("should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).name).toBe("IgnoreRuleError");
				expect((error as Error).message).toContain('field "usersConnection"');
			}
		});
	});

	describe("empty / missing rules", () => {
		it("returns false with no rules", () => {
			expect(shouldIgnoreField("field")).toBe(false);
		});

		it("returns false with empty array", () => {
			expect(shouldIgnoreField("field", [])).toBe(false);
		});

		it("returns false with undefined", () => {
			expect(shouldIgnoreField("field", undefined)).toBe(false);
		});
	});
});

// ---------------------------------------------------------------------------
// Integration tests: ignore rules with depthLimit
// ---------------------------------------------------------------------------

describe("depthLimit with ignore rules", () => {
	it("accepts a single ignore rule without an array", () => {
		const query = parse("{ user { friends { friends { name } } } }");
		const errors = validate(schema, query, [depthLimit(1, { ignore: "friends" })]);
		expect(errors).toHaveLength(0);
	});

	it("ignores fields matching a string rule", () => {
		const query = parse("{ user { friends { friends { friends { name } } } } }");
		const errors = validate(schema, query, [depthLimit(1, { ignore: ["friends"] })]);
		expect(errors).toHaveLength(0);
	});

	it("ignores fields matching a RegExp rule", () => {
		const query = parse("{ user { friends { friends { name } } } }");
		const errors = validate(schema, query, [depthLimit(1, { ignore: [/^friend/] })]);
		expect(errors).toHaveLength(0);
	});

	it("ignores fields matching a function rule", () => {
		const query = parse("{ user { friends { friends { name } } } }");
		const errors = validate(schema, query, [depthLimit(1, { ignore: [(n) => n === "friends"] })]);
		expect(errors).toHaveLength(0);
	});

	it("reports errors thrown by ignore predicates as validation errors", () => {
		const throwingRule = (name: string) => {
			if (name === "friends") {
				throw new Error("boom");
			}
			return false;
		};
		const query = parse("{ user { friends { name } } }");
		const errors = validate(schema, query, [depthLimit(1, { ignore: [throwingRule] })]);
		expect(errors).toHaveLength(1);
		expect(errors[0]?.message).toContain('Ignore rule function threw for field "friends": boom');
		expect(errors[0]?.extensions?.code).toBe("IGNORE_RULE_ERROR");
	});

	it("applies case-insensitive string matching", () => {
		const query = parse("{ user { metadata { createdAt } } }");
		const errors = validate(schema, query, [
			depthLimit(1, { caseInsensitiveIgnore: true, ignore: ["METADATA"] }),
		]);
		expect(errors).toHaveLength(0);
	});

	it("does not apply case-insensitive matching by default", () => {
		const query = parse("{ user { metadata { createdAt } } }");
		const errors = validate(schema, query, [depthLimit(1, { ignore: ["METADATA"] })]);
		expect(errors).toHaveLength(1);
	});

	it("handles stateful regex with /g flag in integration context", () => {
		const globalRegex = /^friends$/g;
		const query = parse(`{
			user {
				friends {
					friends {
						friends {
							name
						}
					}
				}
			}
		}`);
		// All "friends" fields ignored, effective depth is 1 (user -> name)
		const errors = validate(schema, query, [depthLimit(1, { ignore: [globalRegex] })]);
		expect(errors).toHaveLength(0);
	});

	it("throws on invalid ignore rule types", () => {
		const options = { ignore: 123 as unknown } as DepthLimitOptions;
		expect(() => depthLimit(1, options)).toThrow(
			"Invalid ignore rule at index 0: expected string, RegExp, or function",
		);
	});
});

// ---------------------------------------------------------------------------
// Integration tests: ignoreMode
// ---------------------------------------------------------------------------

describe("depthLimit with ignoreMode: exclude", () => {
	it("still traverses children of ignored fields", () => {
		const callback = vi.fn();
		// user(1) -> friends(ignored, no increment = 1) -> friends(ignored, no increment = 1) -> name = 1
		const query = parse("{ user { friends { friends { name } } } }");
		validate(schema, query, [
			depthLimit(10, { ignore: ["friends"], ignoreMode: "exclude" }, callback),
		]);
		expect(callback).toHaveBeenCalledWith({ "[anonymous]": 1 });
	});

	it("enforces depth limits on subtrees of ignored fields", () => {
		// user(1) -> metadata(ignored, no increment = 1) -> createdAt = 1, within limit
		const query = parse("{ user { metadata { createdAt } } }");
		const errors = validate(schema, query, [
			depthLimit(1, { ignore: ["metadata"], ignoreMode: "exclude" }),
		]);
		expect(errors).toHaveLength(0);
	});

	it("rejects when subtree of ignored field exceeds limit", () => {
		// user(1) -> friends(ignored, no increment = 1) -> address(2) -> city = 2, exceeds 1
		const query = parse("{ user { friends { address { city } } } }");
		const errors = validate(schema, query, [
			depthLimit(1, { ignore: ["friends"], ignoreMode: "exclude" }),
		]);
		expect(errors).toHaveLength(1);
	});

	it("defaults to exclude mode (secure)", () => {
		const query = parse("{ user { friends { address { city } } } }");
		// With default "exclude", friends doesn't increment depth, but children are still traversed
		const errors = validate(schema, query, [depthLimit(1, { ignore: ["friends"] })]);
		expect(errors).toHaveLength(1);
	});

	it("skip mode ignores entire subtree", () => {
		const callback = vi.fn();
		const query = parse("{ user { friends { friends { friends { name } } } } }");
		validate(schema, query, [
			depthLimit(10, { ignore: ["friends"], ignoreMode: "skip" }, callback),
		]);
		// friends subtree skipped, only user(1) counted
		expect(callback).toHaveBeenCalledWith({ "[anonymous]": 1 });
	});

	it("ignoreIntrospection: all skips subtree even with ignoreMode: exclude", () => {
		const callback = vi.fn();
		const query = parse("{ __schema { types { name } } }");
		validate(schema, query, [
			depthLimit(0, { ignoreIntrospection: "all", ignoreMode: "exclude" }, callback),
		]);
		expect(callback).toHaveBeenCalledWith({ "[anonymous]": 0 });
	});
});

// ---------------------------------------------------------------------------
// ReDoS (catastrophic backtracking) detection
// ---------------------------------------------------------------------------

describe("ReDoS detection", () => {
	describe("rejects unsafe RegExp patterns at setup time", () => {
		it("rejects nested quantifier: (a+)+", () => {
			expect(() => depthLimit(5, { ignore: [/(a+)+$/] })).toThrow(TypeError);
			expect(() => depthLimit(5, { ignore: [/(a+)+$/] })).toThrow(/nested quantifier/);
		});

		it("rejects nested quantifier: (a+)*", () => {
			expect(() => depthLimit(5, { ignore: [/(a+)*$/] })).toThrow(/nested quantifier/);
		});

		it("rejects nested quantifier: (a*)+", () => {
			expect(() => depthLimit(5, { ignore: [/(a*)+$/] })).toThrow(/nested quantifier/);
		});

		it("rejects nested quantifier: (a*)*", () => {
			expect(() => depthLimit(5, { ignore: [/(a*)*$/] })).toThrow(/nested quantifier/);
		});

		it("rejects nested quantifier: (\\w+)+", () => {
			expect(() => depthLimit(5, { ignore: [/(\w+)+/] })).toThrow(/nested quantifier/);
		});

		it("rejects nested quantifier: (a{2,})+", () => {
			expect(() => depthLimit(5, { ignore: [/(a{2,})+/] })).toThrow(/nested quantifier/);
		});

		it("rejects nested quantifier: (a{2,4})+", () => {
			expect(() => depthLimit(5, { ignore: [/(a{2,4})+/] })).toThrow(/nested quantifier/);
		});

		it("rejects deeply nested quantifier: ((a+)+)+", () => {
			expect(() => depthLimit(5, { ignore: [/((a+)+)+/] })).toThrow(/nested quantifier/);
		});

		it("includes pattern in error message", () => {
			expect(() => depthLimit(5, { ignore: [/(a+)+$/] })).toThrow("/(a+)+$/");
		});
	});

	describe("accepts safe RegExp patterns", () => {
		it("accepts simple prefix: /^internal/", () => {
			expect(() => depthLimit(5, { ignore: [/^internal/] })).not.toThrow();
		});

		it("accepts suffix wildcard: /.*Connection$/", () => {
			expect(() => depthLimit(5, { ignore: [/.*Connection$/] })).not.toThrow();
		});

		it("accepts double underscore: /^__/", () => {
			expect(() => depthLimit(5, { ignore: [/^__/] })).not.toThrow();
		});

		it("accepts alternation without quantifier: /foo|bar/", () => {
			expect(() => depthLimit(5, { ignore: [/foo|bar/] })).not.toThrow();
		});

		it("accepts character class with quantifier: /[a-z]+/", () => {
			expect(() => depthLimit(5, { ignore: [/[a-z]+/] })).not.toThrow();
		});

		it("accepts non-capturing group without nested quantifier: /(?:foo)+/", () => {
			expect(() => depthLimit(5, { ignore: [/(?:foo)+/] })).not.toThrow();
		});

		it("accepts {1} brace quantifier (no repetition): /(a{1})/", () => {
			expect(() => depthLimit(5, { ignore: [/(a{1})+/] })).not.toThrow();
		});

		it("accepts global flag: /test/g", () => {
			expect(() => depthLimit(5, { ignore: [/test/g] })).not.toThrow();
		});

		it("accepts case-insensitive flag: /test/i", () => {
			expect(() => depthLimit(5, { ignore: [/test/i] })).not.toThrow();
		});
	});
});
