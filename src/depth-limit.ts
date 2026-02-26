import {
	type ASTVisitor,
	GraphQLError,
	type OperationDefinitionNode,
	type ValidationContext,
	type ValidationRule,
} from "graphql";

import { ERROR_CODES } from "./constants.js";
import {
	calculateDepth,
	createTraversalCaches,
	extractDefinitions,
	type TraversalConfig,
} from "./depth-engine.js";
import { isUnsafeRegExp } from "./ignore.js";
import type { DepthCallback, DepthLimitFunction, DepthLimitOptions, IgnoreRule } from "./types.js";

/** Valid values for the `directiveMode` option. */
const DIRECTIVE_MODES = new Set<string>(["cap", "override"]);

/** Valid values for the `ignoreMode` option. */
const IGNORE_MODES = new Set<string>(["exclude", "skip"]);

/** Valid values for the `ignoreIntrospection` option. */
const INTROSPECTION_MODES = new Set<string>(["all", "none", "typename"]);

/**
 * Normalized depthLimit options with validated ignore rules.
 */
type NormalizedDepthLimitOptions = Omit<DepthLimitOptions, "ignore"> & {
	ignore?: IgnoreRule[];
};

/**
 * Creates a GraphQL validation rule that limits query depth.
 *
 * Prevents DoS attacks and resource exhaustion from excessively deep queries
 * by enforcing a maximum depth on operations. Supports per-field overrides
 * via the `@depth` directive, customizable ignore rules, and an optional
 * callback for monitoring.
 *
 * Security considerations:
 * - The global `maxDepth` is a hard ceiling by default (`directiveMode: "cap"`)
 * - Correctly handles fragments reused at different depths
 * - Circular fragment references are detected per-path
 * - Only `__typename` is ignored by default (`ignoreIntrospection: "typename"`)
 * - Short-circuits on first violation when no callback is provided
 *
 * Limitations:
 * - Variables in `@depth` directives are not supported (falls back to global limit)
 * - Field names are case-sensitive by default (use `caseInsensitiveIgnore` if needed)
 * - `useDirective: true` requires a schema in the validation context; without one
 *   it silently falls back to the global limit (directives cannot be resolved)
 * - RegExp ignore rules are executed against field names; patterns with catastrophic
 *   backtracking (e.g., `/^(a+)+$/`) may cause performance issues
 *
 * @param maxDepth - Maximum allowed depth for queries (must be a non-negative integer)
 * @param options - Optional configuration for ignore rules, directives, and case sensitivity
 * @param callback - Optional callback invoked with per-operation depths as a plain object payload
 * @returns A GraphQL validation rule function
 * @throws {Error} If `maxDepth` is not a non-negative integer
 *
 * @example
 * ```typescript
 * import { depthLimit } from "graphql-query-depth-limit-esm";
 * import { validate } from "graphql";
 *
 * const errors = validate(schema, document, [
 *   depthLimit(5, {
 *     ignore: ["friends", /.*Connection$/],
 *     useDirective: true,
 *   }),
 * ]);
 *
 * const withCallback = depthLimit(5, (depths) => {
 *   console.log(depths);
 * });
 * ```
 */
export function depthLimit(maxDepth: number, callback?: DepthCallback): ValidationRule;
export function depthLimit(
	maxDepth: number,
	options?: DepthLimitOptions,
	callback?: DepthCallback,
): ValidationRule;
export function depthLimit(
	maxDepth: number,
	options?: DepthLimitOptions | DepthCallback,
	callback?: DepthCallback,
): ValidationRule {
	if (!Number.isInteger(maxDepth) || maxDepth < 0) {
		throw new Error(`Invalid maxDepth: ${maxDepth}. Must be a non-negative integer.`);
	}

	const normalized = normalizeDepthLimitArgs(options, callback);

	return createValidationRule(maxDepth, normalized.options, normalized.callback);
}

/** Compile-time check that the implementation satisfies the public type. */
depthLimit satisfies DepthLimitFunction;

/**
 * Validates that a value is a boolean or undefined.
 */
function assertBooleanOption(name: string, value: unknown): void {
	if (value !== undefined && typeof value !== "boolean") {
		throw new TypeError(`Invalid ${name}: expected boolean, received ${typeof value}.`);
	}
}

/**
 * Creates the validation rule closure with validated parameters.
 */
function createValidationRule(
	maxDepth: number,
	options?: NormalizedDepthLimitOptions,
	callback?: DepthCallback,
): ValidationRule {
	const shortCircuit = options?.shortCircuit ?? callback == null;

	return function depthLimitValidationRule(context: ValidationContext): ASTVisitor {
		const caches = createTraversalCaches();
		const document = context.getDocument();
		const depths: Record<string, number> | undefined = callback
			? createDepthResultRecord()
			: undefined;
		const { fragments, operations } = extractDefinitions(document.definitions);
		const schema = context.getSchema() ?? undefined;
		// By design: when useDirective is true but no schema is available,
		// directives silently fall back to the global maxDepth. This is not a
		// "silent failure" — directives cannot be resolved without type info,
		// so the global limit is the correct and safe default. Emitting an
		// error here would penalize valid schema-less contexts (e.g., custom
		// ValidationContext wrappers) where the user intentionally omits the
		// schema. See DepthLimitOptions.useDirective JSDoc for documentation.
		const useDirective = Boolean(schema) && (options?.useDirective ?? false);

		const nextOperationName = createOperationNameAllocator(operations);

		const config: TraversalConfig = {
			caseInsensitiveIgnore: options?.caseInsensitiveIgnore ?? false,
			directiveMode: options?.directiveMode ?? "cap",
			ignore: options?.ignore,
			ignoreMode: options?.ignoreMode ?? "exclude",
			introspectionMode: options?.ignoreIntrospection ?? "typename",
			limitIgnoredRecursion: options?.limitIgnoredRecursion ?? false,
			shortCircuit,
			useDirective,
		};

		const rootTypeMap = schema
			? {
					mutation: schema.getMutationType() ?? undefined,
					query: schema.getQueryType() ?? undefined,
					subscription: schema.getSubscriptionType() ?? undefined,
				}
			: {
					mutation: undefined,
					query: undefined,
					subscription: undefined,
				};

		for (const operation of operations) {
			const operationName = nextOperationName(operation);
			const rootType = rootTypeMap[operation.operation];

			let result: ReturnType<typeof calculateDepth>;
			try {
				result = calculateDepth(caches, config, fragments, maxDepth, operation, rootType, schema);
			} catch (error) {
				if (error instanceof Error && error.name === "IgnoreRuleError") {
					context.reportError(
						new GraphQLError(error.message, {
							extensions: {
								code: ERROR_CODES.IGNORE_RULE_ERROR,
							},
							nodes: [operation],
							originalError: error,
						}),
					);
					continue;
				}
				throw error;
			}

			if (depths) {
				setDepthResult(depths, operationName, result.depth);
			}

			if (result.violation) {
				const depthValue = result.violation.depth;
				const depthLabel = shortCircuit ? `at least ${depthValue}` : `${depthValue}`;
				const violationPath = result.violation.path;
				const pathSuffix = violationPath.length > 0 ? ` (at ${violationPath.join(".")})` : "";

				context.reportError(
					new GraphQLError(
						`'${operationName}' has depth ${depthLabel} which exceeds maximum allowed depth of ${result.violation.maxDepth}${pathSuffix}`,
						{
							extensions: {
								code: ERROR_CODES.QUERY_TOO_DEEP,
								depth: depthValue,
								maxDepth: result.violation.maxDepth,
								path: violationPath,
								shortCircuit,
							},
							nodes: result.violation.node ? [operation, result.violation.node] : [operation],
						},
					),
				);
			}
		}

		if (callback && depths) {
			// Keep callback payload as a plain object for compatibility.
			callback({ ...depths });
		}

		// All depth validation is performed eagerly above because fragment
		// resolution requires the full document upfront. Nothing remains
		// for the visitor traversal phase.
		return {};
	};
}

/**
 * Determines whether a value is a valid ignore rule.
 */
function isIgnoreRule(rule: unknown): rule is IgnoreRule {
	return typeof rule === "function" || rule instanceof RegExp || typeof rule === "string";
}

/**
 * Normalizes the optional depthLimit arguments.
 */
function normalizeDepthLimitArgs(
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
 * Normalizes and validates depthLimit options.
 */
function normalizeDepthLimitOptions(options: DepthLimitOptions): NormalizedDepthLimitOptions {
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
					`Unsafe RegExp ignore rule at index ${index}: /${rule.source}/${rule.flags} — ${reason}. Use a simpler pattern to avoid catastrophic backtracking.`,
				);
			}
		}
	}

	return rules as IgnoreRule[];
}

/**
 * Creates a null-prototype record for internal depth result accumulation.
 */
function createDepthResultRecord(): Record<string, number> {
	return Object.create(null) as Record<string, number>;
}

/**
 * Creates a stable allocator for callback operation names.
 *
 * Ensures:
 * - Anonymous names never collide with explicit operation names
 * - Duplicate named operations receive deterministic suffixes
 * - Generated names do not overwrite previous callback entries
 */
function createOperationNameAllocator(
	operations: readonly OperationDefinitionNode[],
): (operation: OperationDefinitionNode) => string {
	const explicitNames = new Set<string>();
	for (const operation of operations) {
		if (operation.name?.value) {
			explicitNames.add(operation.name.value);
		}
	}

	const usedNames = new Set<string>();
	const namedCounts = new Map<string, number>();
	let anonymousCount = 0;

	return (operation: OperationDefinitionNode): string => {
		const explicitName = operation.name?.value;
		if (explicitName) {
			let suffix = namedCounts.get(explicitName) ?? 0;
			let candidate = suffix === 0 ? explicitName : `${explicitName}_${suffix}`;

			while (usedNames.has(candidate) || (suffix > 0 && explicitNames.has(candidate))) {
				suffix++;
				candidate = `${explicitName}_${suffix}`;
			}

			namedCounts.set(explicitName, suffix + 1);
			usedNames.add(candidate);
			return candidate;
		}

		anonymousCount++;
		let candidate = anonymousCount === 1 ? "[anonymous]" : `[anonymous:${anonymousCount}]`;
		while (usedNames.has(candidate) || explicitNames.has(candidate)) {
			anonymousCount++;
			candidate = `[anonymous:${anonymousCount}]`;
		}

		usedNames.add(candidate);
		return candidate;
	};
}

/**
 * Safely assigns a depth entry without allowing prototype pollution.
 */
function setDepthResult(target: Record<string, number>, key: string, value: number): void {
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: true,
		value,
		writable: true,
	});
}
