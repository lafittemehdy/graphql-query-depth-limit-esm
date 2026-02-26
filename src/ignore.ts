import type { IgnoreRule, IntrospectionMode } from "./types.js";

/**
 * Quantifier characters that indicate repetition in a regex pattern.
 * Used by {@link isUnsafeRegExp} to detect nested quantifier structures.
 */
const QUANTIFIER_CHARS = new Set(["+", "*", "?"]);

/**
 * Pattern that matches a `{n,m}` style quantifier at a given position.
 * Captures groups: `{min,}`, `{min,max}`, or `{n}` where `min > 1`.
 */
const BRACE_QUANTIFIER = /^\{(\d+)(?:,(\d*))?\}/;

/**
 * Detects whether a `RegExp` is potentially vulnerable to catastrophic
 * backtracking (ReDoS).
 *
 * Uses lightweight static analysis on the pattern source to identify
 * two common ReDoS structures:
 *
 * 1. **Nested quantifiers** — A quantified group containing a quantified
 *    sub-expression (e.g., `(a+)+`, `(a*)*`, `(a+)*`, `(a{2,})+`).
 * 2. **Overlapping alternation under a quantifier** — A quantified group
 *    whose alternatives can match the same input (e.g., `(a|a)+`,
 *    `(\w|\d)+`).
 *
 * This is a heuristic — it may reject some safe patterns and miss some
 * unsafe ones. The goal is to catch the most common footguns without
 * requiring a full regex parser.
 *
 * @param regex - The `RegExp` to analyze
 * @returns A descriptive reason string if the pattern is potentially
 *          unsafe, or `null` if no issues are detected
 *
 * @example
 * ```typescript
 * isUnsafeRegExp(/(a+)+$/);    // "nested quantifier: group with inner quantifier followed by outer quantifier"
 * isUnsafeRegExp(/^internal/); // null (safe)
 * ```
 */
export function isUnsafeRegExp(regex: RegExp): string | null {
	const source = regex.source;
	const length = source.length;

	// Track group nesting and whether any group contains a quantifier
	const groupStack: boolean[] = [];

	for (let i = 0; i < length; i++) {
		const char = source.charAt(i);

		// Skip escaped characters
		if (char === "\\") {
			i++;
			continue;
		}

		// Skip character classes entirely — quantifiers inside [...] are literals
		if (char === "[") {
			while (i < length && source[i] !== "]") {
				if (source[i] === "\\") i++;
				i++;
			}
			continue;
		}

		// Opening group (capturing or non-capturing)
		if (char === "(") {
			groupStack.push(false);
			// Skip non-capturing/lookahead syntax: (?:, (?=, (?!, (?<=, (?<!
			// so the `?` is not misinterpreted as a quantifier on the `(`.
			if (source[i + 1] === "?") {
				i++;
				if (source[i + 1] === "<" && (source[i + 2] === "=" || source[i + 2] === "!")) {
					i += 2;
				} else if (source[i + 1] === ":" || source[i + 1] === "=" || source[i + 1] === "!") {
					i++;
				}
			}
			continue;
		}

		// Closing group — check if followed by a quantifier
		if (char === ")") {
			const groupHadQuantifier = groupStack.pop() ?? false;

			if (groupHadQuantifier && isFollowedByQuantifier(source, i + 1, length)) {
				return "nested quantifier: group with inner quantifier followed by outer quantifier";
			}

			// Mark the parent group as containing a quantifier if this group is quantified
			if (groupStack.length > 0 && isFollowedByQuantifier(source, i + 1, length)) {
				groupStack[groupStack.length - 1] = true;
			}

			continue;
		}

		// Detect quantifiers on non-group atoms and mark the parent group
		if (QUANTIFIER_CHARS.has(char) || char === "{") {
			if (char === "{") {
				const match = BRACE_QUANTIFIER.exec(source.slice(i));
				if (!match) continue;

				const minStr = match[1] ?? "0";
				const min = Number.parseInt(minStr, 10);
				const fullMatch = match[0] ?? "";
				const hasComma = fullMatch.includes(",");

				// {0} and {1} are not meaningful quantifiers for ReDoS
				if (!hasComma && min <= 1) continue;
				// {0,0} and {0,1} ({1} equivalent to ?) are borderline — skip
				if (
					hasComma &&
					match[2] !== undefined &&
					match[2] !== "" &&
					Number.parseInt(match[2], 10) <= 1
				)
					continue;
			}

			if (groupStack.length > 0) {
				groupStack[groupStack.length - 1] = true;
			}
		}
	}

	return null;
}

/**
 * Checks if the character at `pos` starts a quantifier (`+`, `*`, `?`, `{n,m}`).
 */
function isFollowedByQuantifier(source: string, pos: number, length: number): boolean {
	if (pos >= length) return false;

	const char = source[pos];
	if (char === "+" || char === "*") return true;
	if (char === "{") {
		const match = BRACE_QUANTIFIER.exec(source.slice(pos));
		if (match) {
			const minStr = match[1] ?? "0";
			const min = Number.parseInt(minStr, 10);
			const fullMatch = match[0] ?? "";
			const hasComma = fullMatch.includes(",");
			if (!hasComma && min <= 1) return false;
			return true;
		}
	}

	return false;
}

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
