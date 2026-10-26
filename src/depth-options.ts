import { isUnsafeRegExp } from "./ignore.js";
import type { DepthCallback, DepthLimitOptions, IgnoreRule } from "./types.js";

/** Valid values for the `directiveMode` option. */
const DIRECTIVE_MODES = new Set<string>(["cap", "override"]);

/** Valid values for the `ignoreMode` option. */
const IGNORE_MODES = new Set<string>(["exclude", "skip"]);

/** Valid values for the `ignoreIntrospection` option. */
const INTROSPECTION_MODES = new Set<string>(["all", "none", "typename"]);

/**
 * Normalized depthLimit options with validated ignore rules.
 */
export type NormalizedDepthLimitOptions = Omit<DepthLimitOptions, "ignore"> & {
	ignore?: IgnoreRule[];
};

/**
 * Validates that a value is a boolean or undefined.
 */
function assertBooleanOption(name: string, value: unknown): void {
	if (value !== undefined && typeof value !== "boolean") {
		throw new TypeError(`Invalid ${name}: expected boolean, received ${typeof value}.`);
	}
}

/**
 * Determines whether a value is a valid ignore rule.
 */
function isIgnoreRule(rule: unknown): rule is IgnoreRule {
	return typeof rule === "function" || rule instanceof RegExp || typeof rule === "string";
}

/**
 * Normalizes and validates ignore rules.
 */
function normalizeIgnoreRules(ignore: DepthLimitOptions["ignore"]): IgnoreRule[] | undefined {
	if (ignore == null) {
		return undefined;
	}

	const rules: unknown[] = Array.isArray(ignore) ? ignore : [ignore];

	for (const [index, rule] of rules.entries()) {
		if (!isIgnoreRule(rule)) {
			const receivedType = Array.isArray(rule) ? "array" : rule === null ? "null" : typeof rule;
			throw new TypeError(
				`Invalid ignore rule at index ${index}: expected string, RegExp, or function, received ${receivedType}.`,
			);
		}

		if (rule instanceof RegExp) {
			const reason = isUnsafeRegExp(rule);
			if (reason) {
				throw new TypeError(
					`Unsafe RegExp ignore rule at index ${index}: /${rule.source}/${rule.flags} - ${reason}. Use a simpler pattern to avoid catastrophic backtracking.`,
				);
			}
		}
	}

	return rules as IgnoreRule[];
}

/**
 * Normalizes and validates depthLimit options.
 */
function normalizeDepthLimitOptions(options: DepthLimitOptions): NormalizedDepthLimitOptions {
	if (
		options.maxNodes !== undefined &&
		(!Number.isSafeInteger(options.maxNodes) || options.maxNodes <= 0)
	) {
		throw new TypeError("Invalid maxNodes: expected a positive safe integer.");
	}
	assertBooleanOption("caseInsensitiveIgnore", options.caseInsensitiveIgnore);

	if (options.directiveMode !== undefined && !DIRECTIVE_MODES.has(options.directiveMode)) {
		throw new TypeError(
			`Invalid directiveMode: "${options.directiveMode}". Must be "cap" or "override".`,
		);
	}

	if (
		options.ignoreIntrospection !== undefined &&
		!INTROSPECTION_MODES.has(options.ignoreIntrospection)
	) {
		throw new TypeError(
			`Invalid ignoreIntrospection: "${options.ignoreIntrospection}". Must be "all", "none", or "typename".`,
		);
	}

	if (options.ignoreMode !== undefined && !IGNORE_MODES.has(options.ignoreMode)) {
		throw new TypeError(
			`Invalid ignoreMode: "${options.ignoreMode}". Must be "exclude" or "skip".`,
		);
	}

	assertBooleanOption("limitIgnoredRecursion", options.limitIgnoredRecursion);
	assertBooleanOption("shortCircuit", options.shortCircuit);
	assertBooleanOption("useDirective", options.useDirective);

	const ignore = normalizeIgnoreRules(options.ignore);
	return { ...options, ignore };
}

/**
 * Normalizes the optional depthLimit arguments.
 */
export function normalizeDepthLimitArgs(
	options: DepthLimitOptions | DepthCallback | undefined,
	callback: DepthCallback | undefined,
): { callback?: DepthCallback; options?: NormalizedDepthLimitOptions } {
	if (callback !== undefined && typeof callback !== "function") {
		throw new TypeError("Invalid callback: expected a function.");
	}

	if (typeof options === "function") {
		if (callback) {
			throw new TypeError("Invalid depthLimit arguments: callback provided twice.");
		}

		return { callback: options, options: undefined };
	}

	if (
		options !== undefined &&
		(options === null || typeof options !== "object" || Array.isArray(options))
	) {
		const receivedType = Array.isArray(options)
			? "array"
			: options === null
				? "null"
				: typeof options;
		throw new TypeError(`Invalid options: expected an object, received ${receivedType}.`);
	}

	return {
		callback,
		options: options ? normalizeDepthLimitOptions(options) : undefined,
	};
}

/**
 * Creates a null-prototype record for internal depth result accumulation.
 */
export function createDepthResultRecord(): Record<string, number> {
	return Object.create(null) as Record<string, number>;
}

/**
 * Safely assigns a depth entry without allowing prototype pollution.
 */
export function setDepthResult(target: Record<string, number>, key: string, value: number): void {
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: true,
		value,
		writable: true,
	});
}
