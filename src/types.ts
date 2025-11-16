import type { ValidationRule } from "graphql";

export type IgnoreRule = string | RegExp | ((fieldName: string) => boolean);

export interface DepthLimitOptions {
  /**
   * Whether to perform case-insensitive matching for string-based ignore rules
   * When true, "user" will match "User", "USER", etc.
   * Note: GraphQL field names are case-sensitive by specification
   * @default false
   */
  caseInsensitiveIgnore?: boolean;

  /**
   * Fields to exclude from depth calculation
   * Can be strings (exact match), RegExp patterns, or custom functions
   */
  ignore?: IgnoreRule[];

  /**
   * Whether to read depth limits from @depth directive on fields
   * When enabled, field-specific depth limits override the global maxDepth
   * @default false
   */
  useDirective?: boolean;
}

export type DepthCallback = (depths: Record<string, number>) => void;

export type DepthLimitFunction = (
  maxDepth: number,
  options?: DepthLimitOptions,
  callback?: DepthCallback,
) => ValidationRule;
