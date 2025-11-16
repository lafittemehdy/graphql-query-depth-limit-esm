/**
 * GraphQL Query Depth Limiting - ESM Compatible
 *
 * A GraphQL validation rule that limits the depth of queries.
 * Prevents deeply nested queries from overloading your server.
 *
 * @packageDocumentation
 */

export { depthLimit } from "./depthLimit.js";
export type {
  DepthCallback,
  DepthLimitFunction,
  DepthLimitOptions,
  IgnoreRule,
} from "./types.js";
