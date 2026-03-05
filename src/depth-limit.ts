import {
	type ASTVisitor,
	GraphQLError,
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
import {
	createDepthResultRecord,
	createOperationNameAllocator,
	type NormalizedDepthLimitOptions,
	normalizeDepthLimitArgs,
	setDepthResult,
} from "./depth-options.js";
import type { DepthCallback, DepthLimitFunction, DepthLimitOptions } from "./types.js";

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
		// "silent failure" - directives cannot be resolved without type info,
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
