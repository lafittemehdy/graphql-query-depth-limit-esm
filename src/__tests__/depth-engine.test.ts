import { buildSchema, parse, validate } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { calculateDepth, createTraversalCaches, type TraversalConfig } from "../depth-engine.js";
import { depthLimit } from "../depth-limit.js";
import { depthDirectiveTypeDefs } from "../directives.js";
import { createMockContext, directiveSchema, simpleSchema } from "./fixtures.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("depth engine", () => {
	describe("directive-based depth limiting", () => {
		it("uses @depth directive to override global limit (with directiveMode: override)", () => {
			const query = parse(`
				query GetUser {
					user { friends { friends { friends { name } } } }
				}
			`);
			const errors = validate(directiveSchema, query, [
				depthLimit(10, { directiveMode: "override", useDirective: true }),
			]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 3");
		});

		it("caps directive at global limit by default (directiveMode: cap)", () => {
			const query = parse(`
				query GetUser {
					user { friends { friends { friends { name } } } }
				}
			`);
			// Global limit is 3, @depth(max: 2) on friends at depth 1 → relative max 3
			// directiveMode: "cap" → min(3, 3) = 3
			const errors = validate(directiveSchema, query, [depthLimit(3, { useDirective: true })]);
			expect(errors).toHaveLength(1);
		});

		it("allows queries within directive depth", () => {
			const query = parse(`
				query GetUser {
					user { friends { name } }
				}
			`);
			const errors = validate(directiveSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(0);
		});

		it("falls back to global limit when useDirective is false", () => {
			const query = parse(`
				query GetUser {
					user { friends { friends { friends { name } } } }
				}
			`);
			const errors = validate(directiveSchema, query, [depthLimit(10, { useDirective: false })]);
			expect(errors).toHaveLength(0);
		});

		it("falls back to global limit when no directive exists", () => {
			const query = parse(`
				query GetUser {
					user { posts { title } }
				}
			`);
			const errors = validate(directiveSchema, query, [depthLimit(1, { useDirective: true })]);
			expect(errors).toHaveLength(1);
		});
	});

	describe("fragment depth calculation", () => {
		it("counts fragment spread depth correctly", () => {
			const callback = vi.fn();
			const query = parse(`
				query Q {
					user { ...F }
				}
				fragment F on SimpleUser {
					friends { friends { name } }
				}
			`);
			validate(simpleSchema, query, [depthLimit(10, undefined, callback)]);
			// user(1) -> friends(2) -> friends(3) -> name = depth 3
			expect(callback).toHaveBeenCalledWith({ Q: 3 });
		});

		it("counts inline fragment depth correctly", () => {
			const callback = vi.fn();
			const query = parse(`
				query Q {
					user {
						... on SimpleUser {
							friends { name }
						}
					}
				}
			`);
			validate(simpleSchema, query, [depthLimit(10, undefined, callback)]);
			// user(1) -> friends(2) -> name = depth 2 (inline fragment adds no depth)
			expect(callback).toHaveBeenCalledWith({ Q: 2 });
		});

		it("handles nested fragment spreads", () => {
			const callback = vi.fn();
			const query = parse(`
				query Q {
					user { ...A }
				}
				fragment A on SimpleUser { friends { ...B } }
				fragment B on SimpleUser { friends { name } }
			`);
			validate(simpleSchema, query, [depthLimit(10, undefined, callback)]);
			// user(1) -> friends(2) -> friends(3) -> name = depth 3
			expect(callback).toHaveBeenCalledWith({ Q: 3 });
		});
	});

	describe("multiple branches", () => {
		it("reports the maximum depth across branches", () => {
			const callback = vi.fn();
			const query = parse(`
				query Q {
					user {
						name
						friends { friends { name } }
					}
				}
			`);
			validate(simpleSchema, query, [depthLimit(10, undefined, callback)]);
			// user(1) -> name = 1
			// user(1) -> friends(2) -> friends(3) -> name = 3
			// max = 3
			expect(callback).toHaveBeenCalledWith({ Q: 3 });
		});
	});

	describe("alias-aware paths", () => {
		it("uses alias in violation path when present", () => {
			const query = parse("{ user { myFriends: friends { myFriends: friends { name } } } }");
			const errors = validate(simpleSchema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions?.path).toEqual(["user", "myFriends", "myFriends"]);
		});

		it("uses field name when no alias is present", () => {
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(simpleSchema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions?.path).toEqual(["user", "friends", "friends"]);
		});

		it("mixes aliases and bare names in the same path", () => {
			const callback = vi.fn();
			const query = parse(`{
				user {
					pals: friends {
						friends {
							buddies: friends { name }
						}
					}
				}
			}`);
			const errors = validate(simpleSchema, query, [depthLimit(3, undefined, callback)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions?.path).toEqual(["user", "pals", "friends", "buddies"]);
		});

		it("includes alias in error message", () => {
			const query = parse("{ user { myFriends: friends { myFriends: friends { name } } } }");
			const errors = validate(simpleSchema, query, [depthLimit(2)]);
			expect(errors[0]?.message).toContain("(at user.myFriends.myFriends)");
		});
	});

	describe("resolveTypeCondition fallback", () => {
		it("falls back to parent type when type condition resolves to non-composite type", () => {
			// When a type condition names a scalar or enum type, resolveTypeCondition
			// should fall back to the current parent type. GraphQL's own validation
			// would reject this, but our engine handles it defensively.
			const callback = vi.fn();
			const query = parse(`
				query Q {
					user {
						... on String {
							friends { name }
						}
					}
				}
			`);
			const { context } = createMockContext(query, simpleSchema);

			const rule = depthLimit(10, undefined, callback);
			rule(context);

			// "String" is not a composite type → falls back to parent type (SimpleUser)
			// So friends resolves correctly: user(1) → friends(2) → name = 2
			expect(callback).toHaveBeenCalledWith({ Q: 2 });
		});

		it("falls back to parent type when type condition is unknown", () => {
			const callback = vi.fn();
			const query = parse(`
				query Q {
					user {
						... on NonExistentType {
							friends { name }
						}
					}
				}
			`);
			const { context } = createMockContext(query, simpleSchema);

			const rule = depthLimit(10, undefined, callback);
			rule(context);

			// NonExistentType not found in schema → falls back to parent type
			expect(callback).toHaveBeenCalledWith({ Q: 2 });
		});
	});

	describe("inline fragment without type condition", () => {
		it("falls back to parent type and calculates depth correctly", () => {
			const callback = vi.fn();
			const query = parse(`
				query Q {
					user {
						... {
							friends { name }
						}
					}
				}
			`);
			validate(simpleSchema, query, [depthLimit(10, undefined, callback)]);
			// user(1) -> inline fragment (no depth) -> friends(2) -> name = depth 2
			expect(callback).toHaveBeenCalledWith({ Q: 2 });
		});
	});

	describe("defensive non-composite field guard", () => {
		it("skips scalar fields that erroneously have selections", () => {
			const callback = vi.fn();
			// name is a scalar (String) but the query erroneously has a selectionSet.
			// GraphQL's own validation would reject this, but the depth engine
			// handles it defensively when run standalone.
			const query = parse("{ user { name { nonexistent } } }");
			const { context } = createMockContext(query, simpleSchema);

			const rule = depthLimit(10, undefined, callback);
			rule(context);

			// name's selectionSet is skipped because String is not composite.
			// Only user(1) counts → depth = 1
			expect(callback).toHaveBeenCalledWith({ "[anonymous]": 1 });
		});
	});

	describe("exhaustive selection guard", () => {
		it("throws for unknown selection kinds in malformed AST input", () => {
			const malformedNode = {
				selectionSet: {
					selections: [{ kind: "BROKEN_KIND" }],
				},
			} as unknown as Parameters<typeof calculateDepth>[4];

			const config: TraversalConfig = {
				caseInsensitiveIgnore: false,
				directiveMode: "cap",
				ignore: undefined,
				ignoreMode: "exclude",
				introspectionMode: "typename",
				limitIgnoredRecursion: false,
				shortCircuit: false,
				useDirective: false,
			};

			expect(() =>
				calculateDepth(
					createTraversalCaches(),
					config,
					new Map(),
					10,
					malformedNode,
					undefined,
					undefined,
				),
			).toThrow("Unhandled selection kind: BROKEN_KIND");
		});
	});

	describe("interface directive cache", () => {
		it("reuses cached interface list across different fields on the same type", () => {
			const cacheSchema = buildSchema(`
				${depthDirectiveTypeDefs}
				type Query { node: TreeNode }
				interface Node {
					children: [Node] @depth(max: 2)
					siblings: [Node] @depth(max: 3)
				}
				type TreeNode implements Node {
					children: [Node]
					siblings: [Node]
					value: String
				}
			`);

			const callback = vi.fn();
			// Both children and siblings lack @depth on TreeNode, so the engine
			// looks up Node's interface for both. The second lookup hits the
			// interface cache (getCachedInterfaces).
			const query = parse(`{
				node {
					children { ... on TreeNode { value } }
					siblings { ... on TreeNode { value } }
				}
			}`);
			validate(cacheSchema, query, [depthLimit(10, { useDirective: true }, callback)]);

			// node.children(1) → value = 2
			// node.siblings(1) → value = 2
			expect(callback).toHaveBeenCalledWith({ "[anonymous]": 2 });
		});
	});

	describe("short-circuit", () => {
		it("returns immediately on first violation when no callback", () => {
			let q = "name";
			for (let i = 0; i < 50; i++) {
				q = `friends { ${q} }`;
			}
			const query = parse(`{ user { ${q} } }`);

			// Should not traverse all 50 levels — short-circuits at depth 3
			const errors = validate(simpleSchema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 2");
		});

		it("reports true depth with callback (no short-circuit)", () => {
			let q = "name";
			for (let i = 0; i < 10; i++) {
				q = `friends { ${q} }`;
			}
			const query = parse(`{ user { ${q} } }`);
			const callback = vi.fn();

			validate(simpleSchema, query, [depthLimit(2, undefined, callback)]);
			expect(callback).toHaveBeenCalledWith({ "[anonymous]": 11 });
		});
	});
});
