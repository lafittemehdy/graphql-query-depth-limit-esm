import { buildSchema, GraphQLObjectType, GraphQLString } from "graphql";
import { describe, expect, it } from "vitest";
import { depthDirectiveTypeDefs, getDepthFromDirective } from "../directives.js";

// ---------------------------------------------------------------------------
// Unit tests for getDepthFromDirective
// ---------------------------------------------------------------------------

describe("getDepthFromDirective", () => {
	it("returns undefined for undefined field", () => {
		expect(getDepthFromDirective(undefined)).toBeUndefined();
	});

	it("returns undefined for field without astNode", () => {
		const type = new GraphQLObjectType({
			name: "Test",
			fields: { name: { type: GraphQLString } },
		});
		const field = type.getFields().name;
		expect(getDepthFromDirective(field)).toBeUndefined();
	});

	it("returns undefined for field without directives in astNode", () => {
		const schema = buildSchema("type Query { name: String }");
		const queryType = schema.getQueryType();
		const field = queryType?.getFields().name;
		expect(getDepthFromDirective(field)).toBeUndefined();
	});

	it("returns the integer value from @depth(max: N)", () => {
		const schema = buildSchema(`
			${depthDirectiveTypeDefs}
			type Query { users: [User!]! @depth(max: 3) }
			type User { name: String }
		`);
		const field = schema.getQueryType()?.getFields().users;
		expect(getDepthFromDirective(field)).toBe(3);
	});

	it("returns 0 for @depth(max: 0)", () => {
		const schema = buildSchema(`
			${depthDirectiveTypeDefs}
			type Query { users: [User!]! @depth(max: 0) }
			type User { name: String }
		`);
		const field = schema.getQueryType()?.getFields().users;
		expect(getDepthFromDirective(field)).toBe(0);
	});

	it("returns undefined for negative @depth values", () => {
		const schema = buildSchema(`
			${depthDirectiveTypeDefs}
			type Query { users: [User!]! @depth(max: -1) }
			type User { name: String }
		`);
		const field = schema.getQueryType()?.getFields().users;
		expect(getDepthFromDirective(field)).toBeUndefined();
	});

	it("returns undefined when @depth has no arguments", () => {
		const type = new GraphQLObjectType({
			name: "Test",
			fields: {
				value: {
					type: GraphQLString,
					astNode: {
						kind: "FieldDefinition" as const,
						name: { kind: "Name" as const, value: "value" },
						type: {
							kind: "NamedType" as const,
							name: { kind: "Name" as const, value: "String" },
						},
						arguments: [],
						directives: [
							{
								kind: "Directive" as const,
								name: { kind: "Name" as const, value: "depth" },
								arguments: [],
							},
						],
					},
				},
			},
		});
		expect(getDepthFromDirective(type.getFields().value)).toBeUndefined();
	});

	it("returns undefined when directive argument is not 'max'", () => {
		const type = new GraphQLObjectType({
			name: "Test",
			fields: {
				value: {
					type: GraphQLString,
					astNode: {
						kind: "FieldDefinition" as const,
						name: { kind: "Name" as const, value: "value" },
						type: {
							kind: "NamedType" as const,
							name: { kind: "Name" as const, value: "String" },
						},
						arguments: [],
						directives: [
							{
								kind: "Directive" as const,
								name: { kind: "Name" as const, value: "depth" },
								arguments: [
									{
										kind: "Argument" as const,
										name: { kind: "Name" as const, value: "limit" },
										value: { kind: "IntValue" as const, value: "5" },
									},
								],
							},
						],
					},
				},
			},
		});
		expect(getDepthFromDirective(type.getFields().value)).toBeUndefined();
	});

	it("ignores variable-based @depth directives", () => {
		const type = new GraphQLObjectType({
			name: "Test",
			fields: {
				value: {
					type: GraphQLString,
					astNode: {
						kind: "FieldDefinition" as const,
						name: { kind: "Name" as const, value: "value" },
						type: {
							kind: "NamedType" as const,
							name: { kind: "Name" as const, value: "String" },
						},
						arguments: [],
						directives: [
							{
								kind: "Directive" as const,
								name: { kind: "Name" as const, value: "depth" },
								arguments: [
									{
										kind: "Argument" as const,
										name: { kind: "Name" as const, value: "max" },
										value: {
											kind: "Variable" as const,
											name: { kind: "Name" as const, value: "maxDepth" },
										},
									},
								],
							},
						],
					},
				},
			},
		});
		expect(getDepthFromDirective(type.getFields().value)).toBeUndefined();
	});

	it("returns undefined for non-depth directives", () => {
		const schema = buildSchema(`
			directive @deprecated(reason: String) on FIELD_DEFINITION
			type Query { name: String @deprecated(reason: "old") }
		`);
		const field = schema.getQueryType()?.getFields().name;
		expect(getDepthFromDirective(field)).toBeUndefined();
	});
});
