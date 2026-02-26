/**
 * GraphQL Query Depth Limit — ESM Compatible
 *
 * A validation rule that limits query depth and rejects excessively
 * nested queries before execution.  Works with any GraphQL server.
 *
 * @packageDocumentation
 */

// Exports are sorted by module path (biome's organizeImports rule), not by
// export name. This is enforced by the linter and is intentional.
export { ERROR_CODES } from "./constants.js";
export { depthLimit } from "./depth-limit.js";
export { depthDirectiveTypeDefs } from "./directives.js";
export { isUnsafeRegExp } from "./ignore.js";
export type {
	DepthCallback,
	DepthLimitFunction,
	DepthLimitOptions,
	DirectiveMode,
	IgnoreMode,
	IgnoreRule,
	IntrospectionMode,
} from "./types.js";
