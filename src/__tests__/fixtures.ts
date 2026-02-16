import {
	buildSchema,
	type DocumentNode,
	type GraphQLError,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLString,
	GraphQLUnionType,
	type ValidationContext,
} from "graphql";

import { depthDirectiveTypeDefs } from "../directives.js";

// ---------------------------------------------------------------------------
// Mock ValidationContext factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock `ValidationContext` for tests that bypass `validate()`.
 *
 * Returns both the mock context and a `reported` array collecting errors
 * passed to `reportError`. Tests that don't need to inspect errors can
 * ignore the array.
 */
export function createMockContext(
	document: DocumentNode,
	mockSchema: GraphQLSchema | null = null,
): { context: ValidationContext; reported: GraphQLError[] } {
	const reported: GraphQLError[] = [];
	const context = {
		getDocument: () => document,
		getSchema: () => mockSchema,
		reportError: (error: GraphQLError) => {
			reported.push(error);
		},
	} as unknown as ValidationContext;
	return { context, reported };
}

// ---------------------------------------------------------------------------
// Address type (used by User)
// ---------------------------------------------------------------------------

export const AddressType: GraphQLObjectType = new GraphQLObjectType({
	name: "Address",
	fields: () => ({
		city: { type: GraphQLString },
		country: { type: GraphQLString },
		street: { type: GraphQLString },
	}),
});

// ---------------------------------------------------------------------------
// Metadata type (used by ignore-rules tests)
// ---------------------------------------------------------------------------

export const MetadataType: GraphQLObjectType = new GraphQLObjectType({
	name: "Metadata",
	fields: { createdAt: { type: GraphQLString } },
});

// ---------------------------------------------------------------------------
// User type (self-referential via `friends`, with address and metadata)
// ---------------------------------------------------------------------------

export const UserType: GraphQLObjectType = new GraphQLObjectType({
	name: "User",
	fields: () => ({
		address: { type: AddressType },
		friends: { type: new GraphQLList(UserType) },
		metadata: { type: MetadataType },
		name: { type: GraphQLString },
	}),
});

// ---------------------------------------------------------------------------
// Main schema (Query + Mutation)
// ---------------------------------------------------------------------------

export const schema = new GraphQLSchema({
	mutation: new GraphQLObjectType({
		name: "Mutation",
		fields: {
			updateUser: {
				args: { name: { type: new GraphQLNonNull(GraphQLString) } },
				type: UserType,
			},
		},
	}),
	query: new GraphQLObjectType({
		name: "Query",
		fields: {
			user: { type: UserType },
			users: { type: new GraphQLList(UserType) },
		},
	}),
});

// ---------------------------------------------------------------------------
// Simple schema (no address/metadata, for engine tests)
// ---------------------------------------------------------------------------

const SimpleUserType: GraphQLObjectType = new GraphQLObjectType({
	name: "SimpleUser",
	fields: () => ({
		friends: { type: new GraphQLList(SimpleUserType) },
		name: { type: GraphQLString },
	}),
});

export const simpleSchema = new GraphQLSchema({
	query: new GraphQLObjectType({
		name: "Query",
		fields: {
			user: { type: SimpleUserType },
		},
	}),
});

// ---------------------------------------------------------------------------
// Directive schema (SDL, for engine directive tests)
// ---------------------------------------------------------------------------

export const directiveSchema = buildSchema(`
	${depthDirectiveTypeDefs}
	type Query { user: DirectiveUser }
	type DirectiveUser {
		friends: [DirectiveUser] @depth(max: 2)
		name: String
		posts: [DirectivePost]
	}
	type DirectivePost {
		content: String
		title: String
	}
`);

// ---------------------------------------------------------------------------
// Scalar-only schema (for depth-0 tests)
// ---------------------------------------------------------------------------

export const scalarSchema = new GraphQLSchema({
	query: new GraphQLObjectType({
		name: "Query",
		fields: { hello: { type: GraphQLString } },
	}),
});

// ---------------------------------------------------------------------------
// Negative directive schema (SDL, @depth(max: -1) for edge case tests)
// ---------------------------------------------------------------------------

export const negativeDirectiveSchema = buildSchema(`
	${depthDirectiveTypeDefs}
	type Query { user: NegDirUser }
	type NegDirUser {
		friends: [NegDirUser] @depth(max: -1)
		name: String
	}
`);

// ---------------------------------------------------------------------------
// Union schema (for union type tests)
// ---------------------------------------------------------------------------

const CatType: GraphQLObjectType = new GraphQLObjectType({
	name: "Cat",
	fields: () => ({
		color: { type: GraphQLString },
		name: { type: GraphQLString },
	}),
});

const DogType: GraphQLObjectType = new GraphQLObjectType({
	name: "Dog",
	fields: () => ({
		breed: { type: GraphQLString },
		name: { type: GraphQLString },
		puppies: { type: new GraphQLList(DogType) },
	}),
});

const PetUnion = new GraphQLUnionType({
	name: "Pet",
	types: [CatType, DogType],
});

export const unionSchema = new GraphQLSchema({
	query: new GraphQLObjectType({
		name: "Query",
		fields: {
			pet: { type: PetUnion },
			pets: { type: new GraphQLList(PetUnion) },
		},
	}),
});
