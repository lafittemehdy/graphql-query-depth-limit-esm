import type { IgnoreRule, IntrospectionMode } from "./types.js";

/**
 * Determines whether a field should be ignored during depth calculation.
 *
 * Introspection field handling is controlled by the `introspectionMode` parameter:
 * - `"all"` — ignore every `__`-prefixed field
 * - `"typename"` (default) — only ignore `__typename`
 * - `"none"` — count all introspection fields toward depth
 *
 * **Warning:** When `ignoreMode: "skip"` is set, an ignored field's **entire
 * subtree** is skipped — not just the depth increment. Ignoring a composite field
 * bypasses all depth protection for everything nested under it. Use
 * `ignoreMode: "exclude"` (default) to skip only the depth increment while still
 * traversing children.
 *
 * @param fieldName - The name of the field to check
 * @param ignore - Array of ignore rules (strings, RegExp, or functions)
 * @param caseInsensitive - Whether to use case-insensitive matching for string rules
 * @param introspectionMode - How to handle introspection fields
 * @returns `true` if the field should be skipped, `false` otherwise
 *
 * @example
 * ```typescript
 * shouldIgnoreField("__typename", []); // true (introspection, default mode)
 * shouldIgnoreField("__schema", [], false, "typename"); // false (only __typename ignored)
 * shouldIgnoreField("__schema", [], false, "all"); // true (all __ fields ignored)
 * shouldIgnoreField("metadata", ["metadata"]); // true (exact match)
 * shouldIgnoreField("Metadata", ["metadata"], true); // true (case-insensitive)
 * shouldIgnoreField("posts", [/^internal/]); // false (no match)
 * ```
 */
export function shouldIgnoreField(
	fieldName: string,
	ignore?: IgnoreRule[],
	caseInsensitive = false,
	introspectionMode: IntrospectionMode = "typename",
): boolean {
	if (introspectionMode === "all" && fieldName.startsWith("__")) {
		return true;
	}

	if (introspectionMode === "typename" && fieldName === "__typename") {
		return true;
	}

	if (!ignore || ignore.length === 0) {
		return false;
	}

	// Precompute lowercased field name once for all string rule comparisons
	const normalizedFieldName = caseInsensitive ? fieldName.toLowerCase() : fieldName;

	for (const rule of ignore) {
		if (typeof rule === "string") {
			const normalizedRule = caseInsensitive ? rule.toLowerCase() : rule;
			if (normalizedRule === normalizedFieldName) {
				return true;
			}
		} else if (rule instanceof RegExp) {
			try {
				// Reset lastIndex for stateful regexes (/g, /y flags) to ensure
				// consistent results. This mutates the RegExp object, which is
				// intentional. Without the reset, repeated calls with the same
				// global or sticky regex produce inconsistent results.
				if (rule.global || rule.sticky) {
					rule.lastIndex = 0;
				}
				if (rule.test(fieldName)) {
					return true;
				}
			} catch (error) {
				// Frozen or exotic RegExp objects throw on lastIndex mutation or
				// test(). Wrap as IgnoreRuleError so the caller can handle it
				// consistently with function rule errors.
				const message = `Ignore rule RegExp threw for field "${fieldName}": ${
					error instanceof Error ? error.message : String(error)
				}`;
				const wrapped = new Error(message, { cause: error });
				wrapped.name = "IgnoreRuleError";
				throw wrapped;
			}
		} else {
			try {
				if (rule(fieldName)) {
					return true;
				}
			} catch (error) {
				const message = `Ignore rule function threw for field "${fieldName}": ${
					error instanceof Error ? error.message : String(error)
				}`;
				const wrapped = new Error(message, { cause: error });
				wrapped.name = "IgnoreRuleError";
				throw wrapped;
			}
		}
	}

	return false;
}
