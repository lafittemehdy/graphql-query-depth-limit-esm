import { type GraphQLField, Kind } from "graphql";

/**
 * GraphQL SDL type definition for the `@depth` directive.
 *
 * Include this in your schema definition to enable per-field depth
 * overrides when using `depthLimit` with `{ useDirective: true }`.
 *
 * @example
 * ```ts
 * import { makeExecutableSchema } from "@graphql-tools/schema";
 * import { depthDirectiveTypeDefs } from "graphql-query-depth-limit-esm";
 *
 * const schema = makeExecutableSchema({
 *   typeDefs: [depthDirectiveTypeDefs, yourTypeDefs],
 *   resolvers,
 * });
 * ```
 */
export const depthDirectiveTypeDefs = /* GraphQL */ `directive @depth(max: Int!) on FIELD_DEFINITION`;

/**
 * Extracts the maximum depth from a `@depth(max: Int!)` directive on a field definition.
 *
 * Only integer literals are supported. Variables (e.g., `@depth(max: $var)`) are not
 * supported because variable values are unavailable during the validation phase.
 * Fields with variable-based directives fall back to the global depth limit.
 *
 * @param field - The GraphQL field definition to inspect
 * @returns The maximum depth from the directive, or `undefined` if not found or invalid
 *
 * @example
 * ```graphql
 * type Query {
 *   users: [User!]! @depth(max: 3)
 * }
 * ```
 */
export function getDepthFromDirective(
	field: GraphQLField<unknown, unknown> | undefined,
): number | undefined {
	if (!field?.astNode?.directives) {
		return undefined;
	}

	const depthDirective = field.astNode.directives.find((d) => d.name.value === "depth");

	if (!depthDirective?.arguments) {
		return undefined;
	}

	const maxArg = depthDirective.arguments.find((arg) => arg.name.value === "max");

	if (maxArg?.value.kind === Kind.INT) {
		const directiveDepth = Number.parseInt(maxArg.value.value, 10);
		if (Number.isFinite(directiveDepth) && directiveDepth >= 0) {
			return directiveDepth;
		}
	}

	return undefined;
}
