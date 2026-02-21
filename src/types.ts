/**
 * Callback invoked after depth validation with per-operation depth results.
 *
 * The `depths` argument is always a plain object (Object.prototype) for
 * compatibility with common object utilities and `hasOwnProperty` access.
 *
 * @example
 * ```typescript
 * const callback: DepthCallback = (depths) => {
 *   console.log(depths); // { "GetUser": 3, "ListPosts": 5 }
 * };
 * ```
 */
export type DepthCallback = (depths: Record<string, number>) => void;

/**
 * Function signature for the depthLimit validation rule factory.
 */
export interface DepthLimitFunction {
	(
		maxDepth: number,
		options?: DepthLimitOptions,
		callback?: DepthCallback,
	): import("graphql").ValidationRule;
	(maxDepth: number, callback?: DepthCallback): import("graphql").ValidationRule;
}

/**
 * Configuration options for the depth limit validation rule.
 *
 * @example
 * ```typescript
 * const options: DepthLimitOptions = {
 *   caseInsensitiveIgnore: true,
 *   directiveMode: "cap",
 *   ignore: ["metadata", /.*Connection$/],
 *   ignoreIntrospection: "typename",
 *   ignoreMode: "exclude",
 *   shortCircuit: true,
 *   useDirective: true,
 * };
 * ```
 */
export interface DepthLimitOptions {
	/**
	 * Enable case-insensitive matching for string ignore rules.
	 *
	 * Does not affect `RegExp` rules — use the `i` flag on RegExp patterns
	 * for case-insensitive regex matching.
	 *
	 * @default false
	 */
	caseInsensitiveIgnore?: boolean;

	/**
	 * Controls how `@depth` directives interact with the global `maxDepth`.
	 *
	 * - `"cap"` (default): directives can only tighten below the global max
	 * - `"override"`: the first directive replaces the global max for its subtree
	 *
	 * @default "cap"
	 */
	directiveMode?: DirectiveMode;

	/** Rule or array of rules defining which fields to skip during depth calculation. */
	ignore?: IgnoreRule | IgnoreRule[];

	/**
	 * Controls which introspection fields are ignored during depth calculation.
	 *
	 * - `"all"`: ignore every `__`-prefixed field and skip its entire subtree
	 *   (regardless of `ignoreMode`)
	 * - `"typename"` (default): only ignore `__typename`
	 * - `"none"`: count all introspection fields toward depth
	 *
	 * **Note:** When set to `"all"`, introspection fields are always fully
	 * skipped — including their subtree — even when `ignoreMode` is `"exclude"`.
	 * This is intentional: `"all"` is a security hardening mode that completely
	 * eliminates introspection fields from depth calculation.
	 *
	 * @default "typename"
	 */
	ignoreIntrospection?: IntrospectionMode;

	/**
	 * Controls whether ignored fields skip their entire subtree or only the depth increment.
	 *
	 * - `"exclude"` (default): only the depth increment is skipped; children are still traversed
	 * - `"skip"`: the field and its entire subtree are excluded from depth calculation
	 *
	 * **Warning:** Using `"exclude"` on a **recursive** field (e.g., `friends: [User]` where
	 * `User` has a `friends` field) effectively allows unbounded depth on that edge because
	 * the depth increment is suppressed at every level of recursion. If the ignored field
	 * appears in a self-referential chain, the depth counter never advances along that path.
	 * Use `"skip"` instead if unbounded traversal is not intended, or combine `"exclude"`
	 * with a `@depth` directive on the field to cap the subtree independently.
	 *
	 * @default "exclude"
	 */
	ignoreMode?: IgnoreMode;

	/**
	 * Guard against unbounded depth from ignored recursive fields.
	 *
	 * When `true` and `ignoreMode` is `"exclude"`, the engine tracks which
	 * ignored field names have appeared on the current traversal path. If the
	 * same ignored field name is encountered again (indicating recursion),
	 * subsequent occurrences increment depth normally instead of being suppressed.
	 *
	 * This prevents the scenario where `ignoreMode: "exclude"` on a recursive
	 * field (e.g., `friends: [User]`) allows unbounded depth because the depth
	 * counter never advances.
	 *
	 * Has no effect when `ignoreMode` is `"skip"` (the subtree is already removed).
	 *
	 * **Note:** When no schema is available in the validation context, the
	 * recursion guard uses field names alone (without type prefixes). This
	 * means identically named fields on unrelated types may collide on the
	 * same path, causing conservative over-counting. For full type-aware
	 * tracking, ensure a schema is present.
	 *
	 * @default false
	 */
	limitIgnoredRecursion?: boolean;

	/**
	 * Bail immediately on the first depth violation instead of traversing
	 * the full query tree.
	 *
	 * By default, this is automatically determined:
	 * - `true` when no `callback` is provided (fastest path for validation-only use)
	 * - `false` when a `callback` is provided (full traversal needed for accurate depths)
	 *
	 * Set explicitly to override the automatic behavior. For example,
	 * `shortCircuit: false` without a callback traverses the full tree and
	 * reports exact depth in error messages rather than a lower-bound
	 * (`"at least N"`).
	 *
	 * @default undefined (auto-detected from callback presence)
	 */
	shortCircuit?: boolean;

	/**
	 * Read `@depth(max: Int!)` directives from field definitions.
	 *
	 * Requires a schema in the validation context. When no schema is available
	 * (e.g., custom `ValidationContext` with `getSchema()` returning null),
	 * this option silently falls back to the global `maxDepth` because
	 * directives cannot be resolved without type information.
	 *
	 * @default false
	 */
	useDirective?: boolean;
}

/**
 * Controls how `@depth` directives interact with the global `maxDepth`.
 *
 * - `"cap"` — directives can only tighten the limit below the global `maxDepth` (secure default)
 * - `"override"` — the first directive replaces the global limit for its subtree
 */
export type DirectiveMode = "cap" | "override";

/**
 * Controls how ignored fields affect depth traversal.
 *
 * - `"exclude"` — skip the depth increment but still traverse children (secure default)
 * - `"skip"` — skip the field and its entire subtree
 *
 * **Caveat:** `"exclude"` on recursive fields allows unbounded depth along
 * ignored edges because the depth counter never advances. See {@link DepthLimitOptions.ignoreMode}
 * for details and mitigation strategies.
 */
export type IgnoreMode = "exclude" | "skip";

/**
 * Rule for ignoring fields during depth calculation.
 *
 * - `string` — exact field name match (case-sensitive by default)
 * - `RegExp` — pattern match against field names
 * - `function` — custom predicate receiving the field name
 *
 * **Note:** User-provided `RegExp` patterns are executed against field names.
 * Patterns with catastrophic backtracking (e.g., `/^(a+)+$/`) may cause
 * performance issues. Use simple, linear-time patterns where possible.
 *
 * @example
 * ```typescript
 * const rules: IgnoreRule[] = [
 *   "metadata",
 *   /^internal/,
 *   (name) => name.endsWith("Connection"),
 * ];
 * ```
 */
export type IgnoreRule = ((fieldName: string) => boolean) | RegExp | string;

/**
 * Controls which introspection fields are ignored during depth calculation.
 *
 * - `"all"` — ignore every `__`-prefixed field and skip its entire subtree,
 *   regardless of `ignoreMode`
 * - `"typename"` — only ignore `__typename` (secure default)
 * - `"none"` — count all introspection fields toward depth
 *
 * **Note:** Scalar introspection fields (e.g., `__typename`) never increase
 * depth regardless of this setting because only composite fields with nested
 * selections contribute to depth. This setting controls whether such fields
 * are _ignored_ (skipping the depth increment entirely), which matters when
 * they appear as nested selections within composite fields.
 */
export type IntrospectionMode = "all" | "none" | "typename";
