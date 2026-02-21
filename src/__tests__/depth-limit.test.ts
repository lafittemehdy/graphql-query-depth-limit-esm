import {
	buildSchema,
	GraphQLList,
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLString,
	parse,
	validate,
} from "graphql";
import { describe, expect, it, vi } from "vitest";
import { depthLimit } from "../depth-limit.js";
import { depthDirectiveTypeDefs } from "../directives.js";
import {
	createMockContext,
	negativeDirectiveSchema,
	scalarSchema,
	schema,
	unionSchema,
} from "./fixtures.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("depthLimit", () => {
	describe("input validation", () => {
		it("throws on negative maxDepth", () => {
			expect(() => depthLimit(-1)).toThrow("Invalid maxDepth: -1");
		});

		it("throws on non-integer maxDepth", () => {
			expect(() => depthLimit(2.5)).toThrow("Invalid maxDepth: 2.5");
		});

		it("throws on NaN maxDepth", () => {
			expect(() => depthLimit(Number.NaN)).toThrow("Invalid maxDepth: NaN");
		});

		it("throws on Infinity maxDepth", () => {
			expect(() => depthLimit(Number.POSITIVE_INFINITY)).toThrow("Invalid maxDepth");
		});

		it("accepts zero as a valid maxDepth", () => {
			expect(() => depthLimit(0)).not.toThrow();
		});

		it("throws on non-function callback", () => {
			expect(() => depthLimit(5, {} as never, "notAFunction" as never)).toThrow(
				"Invalid callback: expected a function.",
			);
		});

		it("throws when callback is provided twice", () => {
			const cb = vi.fn();
			expect(() => depthLimit(5, cb as never, cb)).toThrow(
				"Invalid depthLimit arguments: callback provided twice.",
			);
		});

		it("throws on null options", () => {
			expect(() => depthLimit(5, null as never)).toThrow(
				"Invalid options: expected an object, received null.",
			);
		});

		it("throws on array options", () => {
			expect(() => depthLimit(5, [] as never)).toThrow(
				"Invalid options: expected an object, received array.",
			);
		});

		it("throws on string options", () => {
			expect(() => depthLimit(5, "bad" as never)).toThrow(
				"Invalid options: expected an object, received string.",
			);
		});

		it("throws on number options", () => {
			expect(() => depthLimit(5, 42 as never)).toThrow(
				"Invalid options: expected an object, received number.",
			);
		});

		it("throws on invalid directiveMode", () => {
			expect(() => depthLimit(5, { directiveMode: "invalid" as never })).toThrow(
				'Invalid directiveMode: "invalid". Must be "cap" or "override".',
			);
		});

		it("throws on invalid ignoreMode", () => {
			expect(() => depthLimit(5, { ignoreMode: "invalid" as never })).toThrow(
				'Invalid ignoreMode: "invalid". Must be "exclude" or "skip".',
			);
		});

		it("throws on invalid ignoreIntrospection", () => {
			expect(() => depthLimit(5, { ignoreIntrospection: "invalid" as never })).toThrow(
				'Invalid ignoreIntrospection: "invalid". Must be "all", "none", or "typename".',
			);
		});

		it("accepts all valid directiveMode values", () => {
			expect(() => depthLimit(5, { directiveMode: "cap" })).not.toThrow();
			expect(() => depthLimit(5, { directiveMode: "override" })).not.toThrow();
		});

		it("accepts all valid ignoreMode values", () => {
			expect(() => depthLimit(5, { ignoreMode: "exclude" })).not.toThrow();
			expect(() => depthLimit(5, { ignoreMode: "skip" })).not.toThrow();
		});

		it("accepts all valid ignoreIntrospection values", () => {
			expect(() => depthLimit(5, { ignoreIntrospection: "all" })).not.toThrow();
			expect(() => depthLimit(5, { ignoreIntrospection: "none" })).not.toThrow();
			expect(() => depthLimit(5, { ignoreIntrospection: "typename" })).not.toThrow();
		});

		it("throws on non-boolean caseInsensitiveIgnore", () => {
			expect(() => depthLimit(5, { caseInsensitiveIgnore: "yes" as never })).toThrow(
				"Invalid caseInsensitiveIgnore: expected boolean, received string.",
			);
		});

		it("throws on non-boolean limitIgnoredRecursion", () => {
			expect(() => depthLimit(5, { limitIgnoredRecursion: 1 as never })).toThrow(
				"Invalid limitIgnoredRecursion: expected boolean, received number.",
			);
		});

		it("throws on non-boolean useDirective", () => {
			expect(() => depthLimit(5, { useDirective: "true" as never })).toThrow(
				"Invalid useDirective: expected boolean, received string.",
			);
		});

		it("throws on non-boolean shortCircuit", () => {
			expect(() => depthLimit(5, { shortCircuit: "yes" as never })).toThrow(
				"Invalid shortCircuit: expected boolean, received string.",
			);
		});

		it("accepts valid boolean option values", () => {
			expect(() =>
				depthLimit(5, {
					caseInsensitiveIgnore: true,
					limitIgnoredRecursion: false,
					shortCircuit: true,
					useDirective: false,
				}),
			).not.toThrow();
		});
	});

	describe("basic depth limiting", () => {
		it("allows queries within the depth limit", () => {
			const query = parse("{ user { name } }");
			const errors = validate(schema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(0);
		});

		it("rejects queries exceeding the depth limit", () => {
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(schema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 2");
		});

		it("allows queries at exactly the depth limit", () => {
			const query = parse("{ user { name } }");
			const errors = validate(schema, query, [depthLimit(1)]);
			expect(errors).toHaveLength(0);
		});

		it("counts depth correctly for nested fields", () => {
			// depth 0: query root
			// depth 1: user
			// depth 2: address
			// depth 3: city (scalar, no increment)
			const query = parse("{ user { address { city } } }");
			const errors = validate(schema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(0);
		});

		it("rejects when depth exceeds limit by one", () => {
			const query = parse("{ user { address { city } } }");
			const errors = validate(schema, query, [depthLimit(1)]);
			expect(errors).toHaveLength(1);
		});

		it("handles scalar-only queries at depth 0", () => {
			const query = parse("{ hello }");
			const errors = validate(scalarSchema, query, [depthLimit(0)]);
			expect(errors).toHaveLength(0);
		});

		it("handles maxDepth 0 with composite fields", () => {
			const query = parse("{ user { name } }");
			const errors = validate(schema, query, [depthLimit(0)]);
			expect(errors).toHaveLength(1);
		});
	});

	describe("multiple operations", () => {
		it("validates each operation independently", () => {
			const query = parse(`
				query Shallow { user { name } }
				query Deep { user { friends { friends { friends { name } } } } }
			`);
			const errors = validate(schema, query, [depthLimit(3)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("Deep");
		});
	});

	describe("mutation support", () => {
		it("validates mutations the same way as queries", () => {
			const query = parse(`
				mutation UpdateUser { updateUser(name: "test") { name } }
			`);
			const errors = validate(schema, query, [depthLimit(1)]);
			expect(errors).toHaveLength(0);
		});
	});

	describe("subscription support", () => {
		const subSchema = buildSchema(`
			type Query { ping: String }
			type Subscription {
				userUpdated: User
			}
			type User {
				name: String
				friends: [User]
			}
		`);

		it("validates subscriptions the same way as queries", () => {
			const query = parse(`
				subscription OnUpdate {
					userUpdated { friends { friends { name } } }
				}
			`);
			const errors = validate(subSchema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("OnUpdate");
		});

		it("allows subscriptions within the depth limit", () => {
			const query = parse(`
				subscription OnUpdate {
					userUpdated { name }
				}
			`);
			const errors = validate(subSchema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(0);
		});
	});

	describe("union support", () => {
		const searchUnionSchema = buildSchema(`
			type Query { search: SearchResult }
			union SearchResult = User | Post
			type User { name: String friends: [User] }
			type Post { title: String author: User }
		`);

		it("counts depth correctly through union inline fragments", () => {
			const query = parse(`{
				search { ... on User { friends { name } } }
			}`);
			const errors = validate(searchUnionSchema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(0);
		});

		it("rejects union selections exceeding the depth limit", () => {
			const query = parse(`{
				search { ... on User { friends { friends { name } } } }
			}`);
			const errors = validate(searchUnionSchema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(1);
		});
	});

	describe("callback", () => {
		it("accepts callback as the second argument when options are omitted", () => {
			const callback = vi.fn();
			const query = parse("{ user { name } }");
			validate(schema, query, [depthLimit(10, callback)]);
			expect(callback).toHaveBeenCalledWith({ anonymous: 1 });
		});

		it("passes a plain object to callback for compatibility", () => {
			const callback = vi.fn((depths: Record<string, number>) => {
				expect(Object.getPrototypeOf(depths)).toBe(Object.prototype);
				expect("hasOwnProperty" in depths).toBe(true);
				expect(Object.hasOwn(depths, "anonymous")).toBe(true);
			});
			const query = parse("{ user { name } }");
			validate(schema, query, [depthLimit(10, callback)]);
			expect(callback).toHaveBeenCalledOnce();
		});

		it("invokes callback with per-operation depths", () => {
			const callback = vi.fn();
			const query = parse(`
				query GetUser { user { name } }
				query ListUsers { users { friends { name } } }
			`);
			validate(schema, query, [depthLimit(10, undefined, callback)]);
			expect(callback).toHaveBeenCalledOnce();
			expect(callback).toHaveBeenCalledWith({ GetUser: 1, ListUsers: 2 });
		});

		it("uses 'anonymous' for unnamed operations", () => {
			const callback = vi.fn();
			const query = parse("{ user { name } }");
			validate(schema, query, [depthLimit(10, undefined, callback)]);
			expect(callback).toHaveBeenCalledWith({ anonymous: 1 });
		});

		it("invokes callback even when violations occur", () => {
			const callback = vi.fn();
			const query = parse("{ user { friends { friends { name } } } }");
			validate(schema, query, [depthLimit(1, undefined, callback)]);
			expect(callback).toHaveBeenCalledOnce();
		});

		it("reports true depth in callback even when query exceeds limit", () => {
			const callback = vi.fn();
			// Query depth: user(1) -> friends(2) -> friends(3) -> name = 3
			const query = parse("{ user { friends { friends { name } } } }");
			validate(schema, query, [depthLimit(1, undefined, callback)]);
			expect(callback).toHaveBeenCalledOnce();
			expect(callback).toHaveBeenCalledWith({ anonymous: 3 });
		});
	});

	describe("fragments", () => {
		it("handles fragment spreads correctly", () => {
			const query = parse(`
				query GetUser {
					user { ...UserFields }
				}
				fragment UserFields on User {
					name
					address { city }
				}
			`);
			const errors = validate(schema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(0);
		});

		it("handles deeply nested fragments", () => {
			const query = parse(`
				query GetUser {
					user { ...UserFields }
				}
				fragment UserFields on User {
					friends { ...FriendFields }
				}
				fragment FriendFields on User {
					friends { name }
				}
			`);
			const errors = validate(schema, query, [depthLimit(3)]);
			expect(errors).toHaveLength(0);
		});

		it("rejects fragments exceeding depth limit", () => {
			const query = parse(`
				query GetUser {
					user { ...UserFields }
				}
				fragment UserFields on User {
					friends { friends { name } }
				}
			`);
			const errors = validate(schema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(1);
		});

		it("handles inline fragments", () => {
			const query = parse(`
				query GetUser {
					user {
						... on User {
							name
							address { city }
						}
					}
				}
			`);
			const errors = validate(schema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(0);
		});

		it("handles circular fragment references without infinite recursion", () => {
			const query = parse(`
				query GetUser {
					user { ...A }
				}
				fragment A on User { friends { ...B } }
				fragment B on User { friends { ...A } }
			`);
			const errors = validate(schema, query, [depthLimit(10)]);
			expect(errors).toHaveLength(0);
		});

		it("calculates fragments correctly when reused at different depths", () => {
			const query = parse(`
				query GetUser {
					user {
						...UserFields
						friends { ...UserFields }
					}
				}
				fragment UserFields on User {
					address { city }
				}
			`);
			const callback = vi.fn();
			validate(schema, query, [depthLimit(10, undefined, callback)]);

			// user(1) -> address(2) -> city = depth 2
			// user(1) -> friends(2) -> address(3) -> city = depth 3
			expect(callback).toHaveBeenCalledWith({ GetUser: 3 });
		});
	});

	describe("introspection fields", () => {
		it("ignores __typename by default", () => {
			const query = parse("{ user { __typename name } }");
			const errors = validate(schema, query, [depthLimit(1)]);
			expect(errors).toHaveLength(0);
		});

		it("counts __schema toward depth by default (ignoreIntrospection: typename)", () => {
			const query = parse("{ __schema { types { name } } }");
			const errors = validate(schema, query, [depthLimit(1)]);
			// __schema(1) -> types(2) -> name = depth 2, exceeds 1
			expect(errors).toHaveLength(1);
		});

		it("ignores all __ fields when ignoreIntrospection is 'all'", () => {
			const query = parse("{ __schema { types { name } } }");
			const callback = vi.fn();
			validate(schema, query, [depthLimit(0, { ignoreIntrospection: "all" }, callback)]);
			expect(callback).toHaveBeenCalledWith({ anonymous: 0 });
		});

		it("does not ignore __typename when ignoreIntrospection is 'none'", () => {
			const query = parse("{ user { __typename } }");
			const errors = validate(schema, query, [depthLimit(0, { ignoreIntrospection: "none" })]);
			expect(errors).toHaveLength(1);
		});
	});

	describe("error extensions", () => {
		it("includes structured extensions in short-circuit mode", () => {
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(schema, query, [depthLimit(1)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions).toEqual({
				code: "QUERY_TOO_DEEP",
				depth: 2,
				maxDepth: 1,
				path: ["user", "friends"],
				shortCircuit: true,
			});
		});

		it("includes exact depth in callback mode (non-short-circuit)", () => {
			const callback = vi.fn();
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(schema, query, [depthLimit(1, undefined, callback)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions).toEqual({
				code: "QUERY_TOO_DEEP",
				depth: 3,
				maxDepth: 1,
				path: ["user", "friends", "friends"],
				shortCircuit: false,
			});
		});

		it("attaches violating field node for precise error locations", () => {
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(schema, query, [depthLimit(1)]);
			expect(errors).toHaveLength(1);
			// The error should have two locations: the operation and the violating field
			expect(errors[0]?.nodes).toBeDefined();
			expect(errors[0]?.nodes?.length).toBe(2);
		});

		it("reflects directive-based maxDepth in extensions", () => {
			const sdlSchema = buildSchema(`
				${depthDirectiveTypeDefs}
				type Query { user: User }
				type User {
					friends: [User] @depth(max: 2)
					name: String
				}
			`);
			const query = parse("{ user { friends { friends { friends { name } } } } }");
			const errors = validate(sdlSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions).toMatchObject({
				code: "QUERY_TOO_DEEP",
				maxDepth: 3,
			});
		});
	});

	describe("short-circuit behavior", () => {
		it("short-circuits when no callback is provided", () => {
			let q = "name";
			for (let i = 0; i < 100; i++) {
				q = `friends { ${q} }`;
			}
			const query = parse(`{ user { ${q} } }`);

			const errors = validate(schema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 2");
		});

		it("traverses full tree when callback is provided", () => {
			let q = "name";
			for (let i = 0; i < 20; i++) {
				q = `friends { ${q} }`;
			}
			const query = parse(`{ user { ${q} } }`);
			const callback = vi.fn();

			validate(schema, query, [depthLimit(2, undefined, callback)]);
			expect(callback).toHaveBeenCalledWith({ anonymous: 21 });
		});
	});

	describe("explicit shortCircuit option", () => {
		it("shortCircuit: true without callback bails on first violation", () => {
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(schema, query, [depthLimit(1, { shortCircuit: true })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions?.shortCircuit).toBe(true);
			expect(errors[0]?.message).toContain("at least");
		});

		it("shortCircuit: true reports the first violating path in query order", () => {
			const query = parse(`{
				user {
					first: friends { friends { friends { name } } }
					second: friends { friends { friends { name } } }
				}
			}`);
			const errors = validate(schema, query, [depthLimit(3, { shortCircuit: true })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions?.path).toEqual(["user", "first", "friends", "friends"]);
		});

		it("shortCircuit: false without callback traverses full tree", () => {
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(schema, query, [depthLimit(1, { shortCircuit: false })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions?.shortCircuit).toBe(false);
			// Exact depth reported (not "at least")
			expect(errors[0]?.message).not.toContain("at least");
			expect(errors[0]?.extensions?.depth).toBe(3);
		});

		it("shortCircuit: true with callback still short-circuits", () => {
			const callback = vi.fn();
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(schema, query, [depthLimit(1, { shortCircuit: true }, callback)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions?.shortCircuit).toBe(true);
			expect(errors[0]?.message).toContain("at least");
			// Callback is still invoked, but depth is the short-circuit depth
			expect(callback).toHaveBeenCalledOnce();
		});

		it("shortCircuit: false with callback is the default behavior", () => {
			const callback = vi.fn();
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(schema, query, [depthLimit(1, { shortCircuit: false }, callback)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions?.shortCircuit).toBe(false);
			expect(errors[0]?.extensions?.depth).toBe(3);
			expect(callback).toHaveBeenCalledWith({ anonymous: 3 });
		});

		it("auto-detects shortCircuit: true when no callback", () => {
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(schema, query, [depthLimit(1)]);
			expect(errors[0]?.extensions?.shortCircuit).toBe(true);
		});

		it("auto-detects shortCircuit: false when callback provided", () => {
			const callback = vi.fn();
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(schema, query, [depthLimit(1, {}, callback)]);
			expect(errors[0]?.extensions?.shortCircuit).toBe(false);
		});
	});

	describe("deepest violation reporting", () => {
		it("reports the deepest violation depth when callback is provided", () => {
			const callback = vi.fn();
			const query = parse(`{
				user {
					address { city }
					friends { friends { friends { name } } }
				}
			}`);
			const errors = validate(schema, query, [depthLimit(2, undefined, callback)]);
			expect(errors).toHaveLength(1);
			// deepest violation at depth 4 (friends -> friends -> friends)
			expect(errors[0]?.message).toContain("depth 4");
		});

		it("reports violation depth (not overall depth) when directive limits a branch", () => {
			const directiveSchema = buildSchema(`
				${depthDirectiveTypeDefs}
				type Query { user: User }
				type User {
					friends: [User] @depth(max: 2)
					name: String
					posts: [Post]
				}
				type Post {
					comments: [Comment]
					title: String
				}
				type Comment {
					replies: [Comment]
					text: String
				}
			`);

			const callback = vi.fn();
			// Branch A (friends): user(1) -> friends(2) -> friends(3) -> friends(4)
			//   @depth(max:2) at depth 1 → limit = 3 → violation at depth 4
			// Branch B (posts): user(1) -> posts(2) -> comments(3) -> replies(4) -> replies(5)
			//   No directive → global limit 10 → no violation
			// Overall max depth: 5, but the violation is at depth 4
			const query = parse(`{
				user {
					friends { friends { friends { name } } }
					posts { comments { replies { replies { text } } } }
				}
			}`);
			const errors = validate(directiveSchema, query, [
				depthLimit(10, { useDirective: true }, callback),
			]);

			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions).toEqual({
				code: "QUERY_TOO_DEEP",
				depth: 4,
				maxDepth: 3,
				path: ["user", "friends", "friends", "friends"],
				shortCircuit: false,
			});
			expect(callback).toHaveBeenCalledWith({ anonymous: 5 });
		});
	});

	describe("edge cases", () => {
		it("handles documents with no operations", () => {
			const query = parse("fragment F on User { name }");
			const errors = validate(schema, query, [depthLimit(1)]);
			expect(errors.some((e) => e.message.includes("exceeds"))).toBe(false);
		});

		it("handles missing schema in validation context", () => {
			const query = parse("{ user { name } }");
			const { context, reported } = createMockContext(query);

			const rule = depthLimit(0);
			rule(context);

			expect(reported).toHaveLength(1);
			expect(reported[0]?.message).toContain("exceeds maximum allowed depth of 0");
		});

		it("handles deeply nested queries (50 levels)", () => {
			let q = "name";
			for (let i = 0; i < 50; i++) {
				q = `friends { ${q} }`;
			}
			const query = parse(`{ user { ${q} } }`);
			const errors = validate(schema, query, [depthLimit(100)]);
			expect(errors).toHaveLength(0);

			const errors2 = validate(schema, query, [depthLimit(10)]);
			expect(errors2).toHaveLength(1);
		});

		it("skips fragment spreads referencing undefined fragments", () => {
			const callback = vi.fn();
			const query = parse(`
				query Q {
					user { ...Missing }
				}
			`);
			const { context, reported } = createMockContext(query, schema);

			const rule = depthLimit(10, undefined, callback);
			rule(context);

			// The ...Missing spread is silently skipped (graphql-js would catch this
			// via its own validation rules). Depth is 1 (just `user`), since the
			// missing fragment contributes no additional selections.
			expect(reported).toHaveLength(0);
			expect(callback).toHaveBeenCalledWith({ Q: 1 });
		});

		it("assigns unique keys for multiple anonymous operations in callback", () => {
			const callback = vi.fn();
			const query = parse(`
				{ user { name } }
				{ user { friends { name } } }
			`);
			const { context } = createMockContext(query, schema);

			const rule = depthLimit(10, undefined, callback);
			rule(context);

			expect(callback).toHaveBeenCalledOnce();
			expect(callback).toHaveBeenCalledWith({ anonymous: 1, anonymous_1: 2 });
		});
	});

	describe("@depth directive with SDL schema", () => {
		const sdlSchema = buildSchema(`
			${depthDirectiveTypeDefs}

			type Query {
				user: User
			}

			type User {
				name: String
				friends: [User] @depth(max: 2)
				posts: [Post]
			}

			type Post {
				title: String
				comments: [Comment] @depth(max: 3)
			}

			type Comment {
				text: String
				replies: [Comment]
			}
		`);

		it("enforces @depth directive on a field", () => {
			const query = parse("{ user { friends { friends { friends { name } } } } }");
			const errors = validate(sdlSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 3");
		});

		it("allows queries within the directive limit", () => {
			const query = parse("{ user { friends { name } } }");
			const errors = validate(sdlSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(0);
		});

		it("falls back to global limit on fields without @depth", () => {
			const query = parse("{ user { posts { title } } }");
			const errors = validate(sdlSchema, query, [depthLimit(1, { useDirective: true })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 1");
		});

		it("ignores @depth directives when useDirective is false", () => {
			const query = parse("{ user { friends { friends { friends { name } } } } }");
			const errors = validate(sdlSchema, query, [depthLimit(10)]);
			expect(errors).toHaveLength(0);
		});

		it("caps directive limit at global maxDepth by default (directiveMode: cap)", () => {
			const query = parse("{ user { posts { comments { text } } } }");
			const errors = validate(sdlSchema, query, [depthLimit(2, { useDirective: true })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 2");
		});

		it("allows directive to override global limit with directiveMode: override", () => {
			const query = parse("{ user { posts { comments { text } } } }");
			const errors = validate(sdlSchema, query, [
				depthLimit(2, { directiveMode: "override", useDirective: true }),
			]);
			expect(errors).toHaveLength(0);
		});

		it("enforces different @depth limits on different fields", () => {
			const query = parse(`{
				user {
					posts {
						comments {
							replies {
								replies {
									replies { text }
								}
							}
						}
					}
				}
			}`);
			const errors = validate(sdlSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 5");
		});

		it("picks the strictest (minimum) @depth limit on nested directive fields", () => {
			const nestedDirectiveSchema = buildSchema(`
				${depthDirectiveTypeDefs}

				type Query {
					root: Level1
				}

				type Level1 {
					child: Level2 @depth(max: 5)
				}

				type Level2 {
					nested: Level3 @depth(max: 2)
				}

				type Level3 {
					deep: Level3
					value: String
				}
			`);

			const query = parse(`{
				root {
					child {
						nested {
							deep {
								deep {
									value
								}
							}
						}
					}
				}
			}`);
			const errors = validate(nestedDirectiveSchema, query, [
				depthLimit(10, { useDirective: true }),
			]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 4");
		});

		it("handles @depth(max: 0) — no nesting allowed beyond the field", () => {
			const zeroSchema = buildSchema(`
				${depthDirectiveTypeDefs}
				type Query { user: User }
				type User {
					name: String
					friends: [User] @depth(max: 0)
				}
			`);

			const query = parse("{ user { friends { name } } }");
			const errors = validate(zeroSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(1);
		});

		it("ignores negative @depth values in SDL (falls back to global limit)", () => {
			const negativeSchema = buildSchema(`
				${depthDirectiveTypeDefs}
				type Query { user: User }
				type User {
					name: String
					friends: [User] @depth(max: -1)
				}
			`);

			const query = parse("{ user { friends { friends { name } } } }");
			// Depth is 3, global limit 2 should still be enforced.
			const errors = validate(negativeSchema, query, [depthLimit(2, { useDirective: true })]);
			expect(errors).toHaveLength(1);
		});
	});

	describe("@depth directive with interface type conditions", () => {
		const interfaceSchema = buildSchema(`
			${depthDirectiveTypeDefs}

			type Query {
				node: Node
			}

			interface Node {
				id: ID!
			}

			type User implements Node {
				id: ID!
				friends: [User] @depth(max: 2)
				name: String
			}

			type Post implements Node {
				id: ID!
				comments: [Comment] @depth(max: 3)
				title: String
			}

			type Comment {
				replies: [Comment]
				text: String
			}
		`);

		it("resolves @depth through inline fragments on interfaces", () => {
			const query = parse(`{
				node {
					... on User { friends { friends { friends { name } } } }
				}
			}`);
			const errors = validate(interfaceSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 3");
		});

		it("allows queries within directive limit through inline fragments", () => {
			const query = parse(`{
				node {
					... on User { friends { friends { name } } }
				}
			}`);
			const errors = validate(interfaceSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(0);
		});

		it("resolves @depth through named fragment spreads on interfaces", () => {
			const query = parse(`
				query Q {
					node { ...UserFields }
				}
				fragment UserFields on User {
					friends { friends { friends { name } } }
				}
			`);
			const errors = validate(interfaceSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 3");
		});

		it("resolves different directives for different types on the same interface", () => {
			const query = parse(`{
				node {
					... on Post {
						comments {
							replies {
								replies {
									replies { text }
								}
							}
						}
					}
				}
			}`);
			const errors = validate(interfaceSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 4");
		});
	});

	describe("@depth directive on interface fields (inheritance)", () => {
		const inheritSchema = buildSchema(`
			${depthDirectiveTypeDefs}

			type Query {
				node: Node
			}

			interface Node {
				id: ID!
				children: [Node] @depth(max: 2)
			}

			type TreeNode implements Node {
				id: ID!
				children: [Node]
				value: String
			}
		`);

		it("inherits @depth from interface when concrete type has no directive", () => {
			// @depth(max: 2) on Node.children at depth 1 → relativeMax = 3, cap(10,3) = 3
			// node(1) -> children(2) -> children(3) -> children(4) → 4 > 3 = violation
			const query = parse(`{
				node {
					... on TreeNode {
						children {
							... on TreeNode {
								children {
									... on TreeNode {
										children { ... on TreeNode { value } }
									}
								}
							}
						}
					}
				}
			}`);
			const errors = validate(inheritSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 3");
		});
	});

	describe("@depth directive on interface-implements-interface (transitive inheritance)", () => {
		const transitiveSchema = buildSchema(`
			${depthDirectiveTypeDefs}

			type Query {
				entity: Entity
			}

			interface Node {
				id: ID!
				related: [Node] @depth(max: 2)
			}

			interface Entity implements Node {
				id: ID!
				related: [Node]
			}

			type User implements Node & Entity {
				id: ID!
				name: String
				related: [Node]
			}
		`);

		const deepTransitiveSchema = buildSchema(`
			${depthDirectiveTypeDefs}

			type Query {
				entity: Entity
			}

			interface Root {
				id: ID!
				related: [Root] @depth(max: 2)
			}

			interface Node implements Root {
				id: ID!
				related: [Root]
			}

			interface Entity implements Node & Root {
				id: ID!
				related: [Root]
			}

			type User implements Entity & Node & Root {
				id: ID!
				name: String
				related: [Root]
			}
		`);

		it("inherits @depth from parent interface when child interface has no directive", () => {
			// Entity.related has no @depth, but Node.related has @depth(max: 2)
			// Inline fragment on Entity → should still enforce Node's limit
			// entity(1) -> related(2) -> related(3) -> related(4) → 4 > 3 = violation
			const query = parse(`{
				entity {
					... on Entity {
						related {
							... on Entity {
								related {
									... on Entity {
										related { ... on User { name } }
									}
								}
							}
						}
					}
				}
			}`);
			const errors = validate(transitiveSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 3");
		});

		it("allows queries within the inherited interface limit", () => {
			// entity(1) -> related(2) -> related(3) → 3 <= 3 = OK
			const query = parse(`{
				entity {
					... on Entity {
						related {
							... on Entity {
								related { ... on User { name } }
							}
						}
					}
				}
			}`);
			const errors = validate(transitiveSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(0);
		});

		it("inherits @depth through concrete type implementing both interfaces", () => {
			// User implements Node & Entity, User.related has no @depth
			// Should inherit @depth(max: 2) from Node.related
			// user(1) -> related(2) -> related(3) -> related(4) → 4 > 3 = violation
			const query = parse(`{
				entity {
					... on User {
						related {
							... on User {
								related {
									... on User {
										related { ... on User { name } }
									}
								}
							}
						}
					}
				}
			}`);
			const errors = validate(transitiveSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 3");
		});

		it("inherits @depth from grandparent interface", () => {
			const query = parse(`{
				entity {
					related {
						related {
							related {
								id
							}
						}
					}
				}
			}`);
			const errors = validate(deepTransitiveSchema, query, [
				depthLimit(10, { useDirective: true }),
			]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 3");
		});
	});

	describe("union types", () => {
		it("handles inline fragments on union types", () => {
			const query = parse(`{
				pet {
					... on Dog { name breed }
					... on Cat { name color }
				}
			}`);
			const errors = validate(unionSchema, query, [depthLimit(1)]);
			expect(errors).toHaveLength(0);
		});

		it("counts depth through union inline fragments correctly", () => {
			const query = parse(`{
				pet {
					... on Dog { puppies { puppies { name } } }
				}
			}`);
			const callback = vi.fn();
			validate(unionSchema, query, [depthLimit(10, undefined, callback)]);
			// pet(1) -> puppies(2) -> puppies(3) -> name = 3
			expect(callback).toHaveBeenCalledWith({ anonymous: 3 });
		});

		it("rejects deep queries through union types", () => {
			const query = parse(`{
				pet {
					... on Dog { puppies { puppies { name } } }
				}
			}`);
			const errors = validate(unionSchema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 2");
		});
	});

	describe("negative @depth in SDL", () => {
		it("ignores negative @depth values and falls back to global limit", () => {
			// @depth(max: -1) is invalid (negative), so global limit of 10 applies
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(negativeDirectiveSchema, query, [
				depthLimit(10, { useDirective: true }),
			]);
			expect(errors).toHaveLength(0);
		});

		it("still enforces global limit when @depth is negative", () => {
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(negativeDirectiveSchema, query, [
				depthLimit(2, { useDirective: true }),
			]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 2");
		});
	});

	describe("stack safety", () => {
		// Note: GraphQL's parse() itself is recursive and blows the stack
		// around ~3,000 levels, so we test at 1,000 — enough to exceed
		// the ~300-level limit of the old recursive engine while staying
		// within the parser's capability.
		it("handles 1,000-level deep query in short-circuit mode", () => {
			let q = "name";
			for (let i = 0; i < 1_000; i++) {
				q = `friends { ${q} }`;
			}
			const query = parse(`{ user { ${q} } }`);

			const errors = validate(schema, query, [depthLimit(5)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 5");
		});

		it("handles 1,000-level deep query with callback without stack overflow", () => {
			let q = "name";
			for (let i = 0; i < 1_000; i++) {
				q = `friends { ${q} }`;
			}
			const query = parse(`{ user { ${q} } }`);
			const callback = vi.fn();

			const errors = validate(schema, query, [depthLimit(5, undefined, callback)]);
			expect(errors).toHaveLength(1);
			expect(callback).toHaveBeenCalledWith({ anonymous: 1_001 });
		});
	});

	describe("path-aware error reporting", () => {
		it("includes violation path in error extensions (short-circuit)", () => {
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(schema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions?.path).toEqual(["user", "friends", "friends"]);
		});

		it("includes violation path in error message", () => {
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(schema, query, [depthLimit(2)]);
			expect(errors[0]?.message).toContain("(at user.friends.friends)");
		});

		it("includes deepest violation path in callback mode", () => {
			const callback = vi.fn();
			const query = parse(`{
				user {
					address { city }
					friends { friends { friends { name } } }
				}
			}`);
			const errors = validate(schema, query, [depthLimit(2, undefined, callback)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions?.path).toEqual(["user", "friends", "friends", "friends"]);
		});

		it("tracks path through fragment spreads", () => {
			const callback = vi.fn();
			const query = parse(`
				query Q {
					user { ...F }
				}
				fragment F on User {
					friends { friends { friends { name } } }
				}
			`);
			const errors = validate(schema, query, [depthLimit(3, undefined, callback)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions?.path).toEqual(["user", "friends", "friends", "friends"]);
		});

		it("tracks path through inline fragments", () => {
			const query = parse(`{
				user {
					... on User {
						friends { friends { name } }
					}
				}
			}`);
			const errors = validate(schema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions?.path).toEqual(["user", "friends", "friends"]);
		});

		it("uses alias in violation path when field is aliased", () => {
			const query = parse("{ user { pals: friends { pals: friends { name } } } }");
			const errors = validate(schema, query, [depthLimit(2)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions?.path).toEqual(["user", "pals", "pals"]);
			expect(errors[0]?.message).toContain("(at user.pals.pals)");
		});

		it("uses field name in path when no alias is present", () => {
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(schema, query, [depthLimit(2)]);
			expect(errors[0]?.extensions?.path).toEqual(["user", "friends", "friends"]);
		});

		it("mixes aliases and bare field names in violation path", () => {
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
			const errors = validate(schema, query, [depthLimit(3, undefined, callback)]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.extensions?.path).toEqual(["user", "pals", "friends", "buddies"]);
		});
	});

	describe("directiveMode: override with nested directives", () => {
		it("allows first directive to override global limit, subsequent directives tighten", () => {
			const nestedSchema = buildSchema(`
				${depthDirectiveTypeDefs}
				type Query { root: Level1 }
				type Level1 { child: Level2 @depth(max: 5) }
				type Level2 { nested: Level3 @depth(max: 2) }
				type Level3 {
					deep: Level3
					value: String
				}
			`);

			// root(1) → child(2): @depth(max:5), override → relativeMax = 1+5 = 6
			// → nested(3): @depth(max:2), hasDirectiveLimit=true → min(6, 2+2) = min(6, 4) = 4
			// → deep(4) ok → deep(5) → 5 > 4 = violation
			const query = parse(`{
				root {
					child {
						nested {
							deep { deep { deep { value } } }
						}
					}
				}
			}`);
			const errors = validate(nestedSchema, query, [
				depthLimit(3, { directiveMode: "override", useDirective: true }),
			]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 4");
		});

		it("first override replaces global limit entirely", () => {
			const overrideSchema = buildSchema(`
				${depthDirectiveTypeDefs}
				type Query { user: User }
				type User {
					friends: [User] @depth(max: 10)
					name: String
				}
			`);

			// Global limit = 2, but @depth(max:10) with override → relativeMax = 1+10 = 11
			// user(1) → friends(2) → friends(3) → name = depth 3, within 11
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(overrideSchema, query, [
				depthLimit(2, { directiveMode: "override", useDirective: true }),
			]);
			expect(errors).toHaveLength(0);
		});
	});

	describe("useDirective with programmatic schemas", () => {
		it("falls back to global limit when field has no astNode", () => {
			const NoAstUserType: GraphQLObjectType = new GraphQLObjectType({
				name: "User",
				fields: () => ({
					friends: { type: new GraphQLList(NoAstUserType) },
					name: { type: GraphQLString },
				}),
			});

			const programmaticSchema = new GraphQLSchema({
				query: new GraphQLObjectType({
					name: "Query",
					fields: { user: { type: NoAstUserType } },
				}),
			});

			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(programmaticSchema, query, [depthLimit(2, { useDirective: true })]);
			// No astNode → no @depth → global limit 2 applies
			// user(1) → friends(2) → friends(3) → 3 > 2 = violation
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 2");
		});
	});

	describe("variable-based @depth directive", () => {
		it("ignores variable-based @depth and falls back to global limit", () => {
			// Use the negativeDirectiveSchema pattern but with a Variable node
			const VarDirUserType: GraphQLObjectType = new GraphQLObjectType({
				name: "VarDirUser",
				fields: () =>
					({
						friends: {
							type: new GraphQLList(VarDirUserType),
							astNode: {
								kind: "FieldDefinition",
								name: { kind: "Name", value: "friends" },
								type: {
									kind: "ListType",
									type: {
										kind: "NamedType",
										name: { kind: "Name", value: "VarDirUser" },
									},
								},
								arguments: [],
								directives: [
									{
										kind: "Directive",
										name: { kind: "Name", value: "depth" },
										arguments: [
											{
												kind: "Argument",
												name: { kind: "Name", value: "max" },
												value: {
													kind: "Variable",
													name: { kind: "Name", value: "maxDepth" },
												},
											},
										],
									},
								],
							},
						},
						name: { type: GraphQLString },
					}) as never,
			});

			const varSchema = new GraphQLSchema({
				query: new GraphQLObjectType({
					name: "Query",
					fields: () => ({ user: { type: VarDirUserType } }),
				}),
			});

			// Variable-based @depth(max: $var) should be ignored → global limit 10 applies
			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(varSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(0);

			// With a lower global limit, the global limit should still be enforced
			const errors2 = validate(varSchema, query, [depthLimit(2, { useDirective: true })]);
			expect(errors2).toHaveLength(1);
		});
	});

	describe("ignoreMode: skip combined with directives", () => {
		it("skip mode takes precedence over directive resolution", () => {
			const sdlSchema = buildSchema(`
				${depthDirectiveTypeDefs}
				type Query { user: User }
				type User {
					friends: [User] @depth(max: 1)
					name: String
				}
			`);

			// friends is both ignored (skip mode) and has a directive
			// Since skip mode removes the field entirely, the directive never applies
			const query = parse("{ user { friends { friends { friends { name } } } } }");
			const errors = validate(sdlSchema, query, [
				depthLimit(10, { ignore: ["friends"], ignoreMode: "skip", useDirective: true }),
			]);
			// friends subtrees are entirely skipped → effective depth = 1 (user)
			expect(errors).toHaveLength(0);
		});

		it("exclude mode still applies directive limits that constrain subtree depth", () => {
			const sdlSchema = buildSchema(`
				${depthDirectiveTypeDefs}
				type Query { user: User }
				type User {
					address: Address
					friends: [User] @depth(max: 0)
					name: String
				}
				type Address { city: String }
			`);

			// friends is ignored (exclude mode): no depth increment, children still traversed
			// @depth(max:0) on friends at depth 1 → relativeMax = 1+0 = 1, fieldMaxDepth = 1
			// friends(1, ignored, no increment) → address(2) → 2 > 1 = violation
			const query = parse("{ user { friends { address { city } } } }");
			const errors = validate(sdlSchema, query, [
				depthLimit(10, { ignore: ["friends"], ignoreMode: "exclude", useDirective: true }),
			]);
			expect(errors).toHaveLength(1);
		});
	});

	describe("@depth directive in extend type schemas", () => {
		it("enforces @depth directive defined in extend type", () => {
			const extendSchema = buildSchema(`
				${depthDirectiveTypeDefs}
				type Query { user: User }
				type User { name: String }
				extend type User { friends: [User] @depth(max: 2) }
			`);

			const query = parse("{ user { friends { friends { friends { name } } } } }");
			const errors = validate(extendSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 3");
		});

		it("allows queries within extend type directive limit", () => {
			const extendSchema = buildSchema(`
				${depthDirectiveTypeDefs}
				type Query { user: User }
				type User { name: String }
				extend type User { friends: [User] @depth(max: 2) }
			`);

			const query = parse("{ user { friends { friends { name } } } }");
			const errors = validate(extendSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(0);
		});
	});

	describe("@depth precedence: object field vs interface field", () => {
		it("prefers concrete type directive over interface directive", () => {
			const precedenceSchema = buildSchema(`
				${depthDirectiveTypeDefs}
				type Query { node: Node }
				interface Node {
					id: ID!
					children: [Node] @depth(max: 5)
				}
				type TreeNode implements Node {
					id: ID!
					children: [Node] @depth(max: 1)
					value: String
				}
			`);

			// TreeNode.children has @depth(max: 1), Node.children has @depth(max: 5)
			// Concrete type takes precedence → relativeMax = 1+1 = 2
			// node(1) → children(2) → children(3) → 3 > 2 = violation
			const query = parse(`{
				node {
					... on TreeNode {
						children {
							... on TreeNode {
								children { ... on TreeNode { value } }
							}
						}
					}
				}
			}`);
			const errors = validate(precedenceSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 2");
		});

		it("inherits interface directive when concrete type has none", () => {
			const precedenceSchema = buildSchema(`
				${depthDirectiveTypeDefs}
				type Query { node: Node }
				interface Node {
					id: ID!
					children: [Node] @depth(max: 2)
				}
				type TreeNode implements Node {
					id: ID!
					children: [Node]
					value: String
				}
			`);

			// TreeNode.children has no @depth → inherits Node.children @depth(max: 2)
			// node(1) → children(2) → children(3) → children(4) → 4 > 3 = violation
			const query = parse(`{
				node {
					... on TreeNode {
						children {
							... on TreeNode {
								children {
									... on TreeNode {
										children { ... on TreeNode { value } }
									}
								}
							}
						}
					}
				}
			}`);
			const errors = validate(precedenceSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 3");
		});

		it("picks strictest interface directive when multiple interfaces define @depth", () => {
			const multiIfaceSchema = buildSchema(`
				${depthDirectiveTypeDefs}
				type Query { node: NodeA }
				interface NodeA {
					id: ID!
					related: [NodeA] @depth(max: 5)
				}
				interface NodeB {
					id: ID!
					related: [NodeA] @depth(max: 2)
				}
				type Entity implements NodeA & NodeB {
					id: ID!
					related: [NodeA]
					name: String
				}
			`);

			// Entity.related has no @depth, inherits min(NodeA=5, NodeB=2) = 2
			// node(1) → related(2) → related(3) → related(4) → 4 > 3 = violation
			const query = parse(`{
				node {
					... on Entity {
						related {
							... on Entity {
								related {
									... on Entity {
										related { ... on Entity { name } }
									}
								}
							}
						}
					}
				}
			}`);
			const errors = validate(multiIfaceSchema, query, [depthLimit(10, { useDirective: true })]);
			expect(errors).toHaveLength(1);
			expect(errors[0]?.message).toContain("exceeds maximum allowed depth of 3");
		});
	});

	describe("anonymous operation name collision", () => {
		it("avoids collision when a named operation is called 'anonymous'", () => {
			const callback = vi.fn();
			const query = parse(`
					query anonymous { user { name } }
					{ user { friends { name } } }
			`);
			const { context } = createMockContext(query, schema);

			const rule = depthLimit(10, undefined, callback);
			rule(context);

			expect(callback).toHaveBeenCalledOnce();
			const depths = callback.mock.calls[0]?.[0] as Record<string, number>;
			// Named "anonymous" should keep its name, unnamed should get a different key
			expect(depths).toHaveProperty("anonymous", 1);
			expect(Object.keys(depths)).toHaveLength(2);
			// The unnamed operation should NOT overwrite the named one
			const unnamedKey = Object.keys(depths).find((k) => k !== "anonymous");
			expect(unnamedKey).toBeDefined();
			if (unnamedKey) {
				expect(depths[unnamedKey]).toBe(2);
			}
		});

		it("assigns unique callback keys for duplicate named operations", () => {
			const callback = vi.fn();
			const query = parse(`
					query Same { user { name } }
					query Same { user { friends { name } } }
					query Same_1 { user { friends { friends { name } } } }
				`);
			const { context } = createMockContext(query, schema);

			const rule = depthLimit(10, undefined, callback);
			rule(context);

			expect(callback).toHaveBeenCalledOnce();
			const depths = callback.mock.calls[0]?.[0] as Record<string, number>;
			expect(depths).toHaveProperty("Same", 1);
			expect(depths).toHaveProperty("Same_2", 2);
			expect(depths).toHaveProperty("Same_1", 3);
			expect(Object.keys(depths)).toHaveLength(3);
		});
	});

	describe("IgnoreRuleError recovery across operations", () => {
		it("continues processing subsequent operations after IgnoreRuleError", () => {
			const throwingRule = (name: string) => {
				if (name === "friends") {
					throw new Error("boom");
				}
				return false;
			};
			const callback = vi.fn();
			// First operation hits "friends" → IgnoreRuleError
			// Second operation has no "friends" → succeeds
			const query = parse(`
				query A { user { friends { name } } }
				query B { user { address { city } } }
			`);
			const { context, reported } = createMockContext(query, schema);

			const rule = depthLimit(10, { ignore: [throwingRule] }, callback);
			rule(context);

			// Operation A should report IgnoreRuleError
			expect(reported).toHaveLength(1);
			expect(reported[0]?.extensions?.code).toBe("IGNORE_RULE_ERROR");
			expect(reported[0]?.message).toContain("boom");

			// Operation B should still be processed and appear in callback
			expect(callback).toHaveBeenCalledOnce();
			expect(callback).toHaveBeenCalledWith({ B: 2 });
		});
	});

	describe("unexpected engine errors", () => {
		it("rethrows non-IgnoreRuleError exceptions", () => {
			const malformedDocument = {
				definitions: [
					{
						kind: "OperationDefinition",
						operation: "query",
						selectionSet: {
							selections: [{ kind: "BROKEN_KIND" }],
						},
					},
				],
			};
			const { context } = createMockContext(malformedDocument as never, schema);

			const rule = depthLimit(10);
			expect(() => rule(context)).toThrow("Unhandled selection kind: BROKEN_KIND");
		});
	});

	describe("callback error propagation", () => {
		it("propagates callback exceptions to the caller", () => {
			const error = new Error("callback failed");
			const throwingCallback = () => {
				throw error;
			};
			const query = parse("{ user { name } }");
			expect(() => validate(schema, query, [depthLimit(10, throwingCallback)])).toThrow(
				"callback failed",
			);
		});
	});

	describe("limitIgnoredRecursion", () => {
		it("allows unbounded ignored recursion by default", () => {
			const callback = vi.fn();
			const query = parse("{ user { friends { friends { friends { name } } } } }");
			validate(schema, query, [
				depthLimit(10, { ignore: ["friends"], ignoreMode: "exclude" }, callback),
			]);
			// Without guard: friends never increments depth, effective depth = 1 (user)
			expect(callback).toHaveBeenCalledWith({ anonymous: 1 });
		});

		it("increments depth for repeated ignored fields when enabled", () => {
			const callback = vi.fn();
			const query = parse("{ user { friends { friends { friends { name } } } } }");
			validate(schema, query, [
				depthLimit(
					10,
					{ ignore: ["friends"], ignoreMode: "exclude", limitIgnoredRecursion: true },
					callback,
				),
			]);
			// With guard: first friends(ignored, no increment=1), second friends(repeated, increment=2),
			// third friends(repeated, increment=3)
			expect(callback).toHaveBeenCalledWith({ anonymous: 3 });
		});

		it("enforces depth limit on repeated ignored fields", () => {
			const query = parse("{ user { friends { friends { friends { name } } } } }");
			const errors = validate(schema, query, [
				depthLimit(2, { ignore: ["friends"], ignoreMode: "exclude", limitIgnoredRecursion: true }),
			]);
			// user(1) → friends(ignored, 1) → friends(repeated, 2) → friends(repeated, 3) > 2
			expect(errors).toHaveLength(1);
		});

		it("has no effect when ignoreMode is skip", () => {
			const callback = vi.fn();
			const query = parse("{ user { friends { friends { friends { name } } } } }");
			validate(schema, query, [
				depthLimit(
					10,
					{ ignore: ["friends"], ignoreMode: "skip", limitIgnoredRecursion: true },
					callback,
				),
			]);
			// skip mode removes entire subtree; limitIgnoredRecursion irrelevant
			expect(callback).toHaveBeenCalledWith({ anonymous: 1 });
		});

		it("tracks ignored fields independently per path", () => {
			const callback = vi.fn();
			const query = parse(`{
				user {
					friends { friends { name } }
					address { city }
				}
			}`);
			validate(schema, query, [
				depthLimit(
					10,
					{ ignore: ["friends"], ignoreMode: "exclude", limitIgnoredRecursion: true },
					callback,
				),
			]);
			// Path 1: user(1) → friends(ignored,1) → friends(repeated,2) → name = 2
			// Path 2: user(1) → address(2) → city = 2
			expect(callback).toHaveBeenCalledWith({ anonymous: 2 });
		});

		it("uses field-name-only keys when no schema is available (conservative)", () => {
			const callback = vi.fn();
			// Without a schema, limitIgnoredRecursion uses field name alone as key.
			// This means identically named fields on different types collide,
			// causing conservative over-counting (depth increments sooner).
			const query = parse("{ user { friends { friends { friends { name } } } } }");
			const { context } = createMockContext(query);

			const rule = depthLimit(
				10,
				{ ignore: ["friends"], ignoreMode: "exclude", limitIgnoredRecursion: true },
				callback,
			);
			rule(context);

			// Without schema: key is just "friends" (no type prefix)
			// user(1) → friends(ignored, 1) → friends(repeated, 2) → friends(repeated, 3) → name = 3
			expect(callback).toHaveBeenCalledWith({ anonymous: 3 });
		});

		it("does not false-positive when unrelated types share the same field name", () => {
			// Schema where A.items -> B and B.items -> C are unrelated fields
			// that happen to share the name "items"
			const chainSchema = buildSchema(`
				type Query { root: A }
				type A { items: [B] }
				type B { items: [C] name: String }
				type C { value: String }
			`);

			const callback = vi.fn();
			const query = parse(`{
				root {
					items {
						items { value }
					}
				}
			}`);
			validate(chainSchema, query, [
				depthLimit(
					10,
					{ ignore: ["items"], ignoreMode: "exclude", limitIgnoredRecursion: true },
					callback,
				),
			]);
			// root(1) → items(A.items, ignored, no increment=1) → items(B.items, different type,
			// ignored, no increment=1) → value = 1
			// Type-aware guard: "A:items" and "B:items" are different keys, so both are
			// first occurrences and neither increments depth.
			expect(callback).toHaveBeenCalledWith({ anonymous: 1 });
		});
	});

	describe("useDirective with null schema", () => {
		it("falls back to global limit when getSchema returns null", () => {
			const query = parse("{ user { friends { friends { name } } } }");
			const { context, reported } = createMockContext(query);

			const rule = depthLimit(2, { useDirective: true });
			rule(context);

			// No schema → useDirective has no effect → global limit 2 applies
			expect(reported).toHaveLength(1);
			expect(reported[0]?.message).toContain("exceeds maximum allowed depth of 2");
		});
	});
});
