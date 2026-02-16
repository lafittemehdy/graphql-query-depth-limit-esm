import {
	type ASTNode,
	type DefinitionNode,
	type FragmentDefinitionNode,
	type GraphQLField,
	type GraphQLInterfaceType,
	type GraphQLObjectType,
	type GraphQLOutputType,
	type GraphQLSchema,
	getNamedType,
	isCompositeType,
	isInterfaceType,
	isObjectType,
	Kind,
	type OperationDefinitionNode,
	type SelectionNode,
} from "graphql";

import { getDepthFromDirective } from "./directives.js";
import { shouldIgnoreField } from "./ignore.js";
import type { DirectiveMode, IgnoreMode, IgnoreRule, IntrospectionMode } from "./types.js";

/**
 * Result returned by the depth calculation engine.
 */
interface DepthResult {
	/** Maximum depth found across all branches */
	depth: number;
	/** Deepest violation found, or `null` if within limits */
	violation: DepthViolation | null;
}

/**
 * Records a depth limit violation with the offending depth and its limit.
 */
interface DepthViolation {
	/** The actual depth that exceeded the limit */
	depth: number;
	/** The maximum allowed depth that was exceeded */
	maxDepth: number;
	/** The AST node that caused the violation, for precise error locations */
	node?: ASTNode;
	/** Field path from the operation root to the violation point */
	path: string[];
}

/**
 * Result of resolving a `@depth` directive on a field definition.
 * @internal
 */
interface DirectiveResolution {
	/** Whether a directive limit is now active on this path */
	hasDirectiveLimit: boolean;
	/** The resolved maximum depth for this branch */
	maxDepth: number;
}

/**
 * Lightweight linked-list node for building field paths without per-field
 * array allocations. Only materialized into `string[]` when reporting a
 * violation or populating callback results.
 * @internal
 */
interface PathNode {
	/** Parent node in the path, or `undefined` for the root */
	parent: PathNode | undefined;
	/** Field name or alias for this path segment */
	segment: string;
}

/**
 * Single unit of work on the iterative DFS stack.
 * @internal
 */
interface StackFrame {
	/** Current depth at this point in traversal */
	currentDepth: number;
	/** Whether a `@depth` directive has already constrained this path */
	hasDirectiveLimit: boolean;
	/** Ignored field names seen on the current path (for recursion guard) */
	ignoredFieldsOnPath: Set<string>;
	/** Maximum allowed depth for this branch */
	maxDepth: number;
	/** The AST node whose selectionSet should be processed */
	node: ASTNode & { selectionSet?: { selections: readonly SelectionNode[] } };
	/** Parent type for field resolution */
	parentType: GraphQLOutputType | undefined;
	/** Linked-list path from the operation root to this node */
	path: PathNode | undefined;
	/** Fragment names visited on the current path (for cycle detection) */
	visitedFragments: Set<string>;
}

/**
 * Caches shared across all stack frames during a single validation run
 * to avoid repeated interface graph walks and directive AST lookups.
 * @internal
 */
interface TraversalCaches {
	/** Cached raw directive depth per `typeName:fieldName` */
	directiveDepths: Map<string, number | undefined>;
	/** Cached interface lists per type name */
	interfaces: Map<string, GraphQLInterfaceType[]>;
}

/**
 * Immutable configuration shared across all stack frames during traversal.
 * @internal
 */
interface TraversalConfig {
	/** Whether to use case-insensitive matching for string ignore rules */
	caseInsensitiveIgnore: boolean;
	/** Controls how `@depth` directives interact with the global `maxDepth` */
	directiveMode: DirectiveMode;
	/** Rules for fields to ignore in depth calculation */
	ignore: IgnoreRule[] | undefined;
	/** Controls how ignored fields affect depth traversal */
	ignoreMode: IgnoreMode;
	/** Controls which introspection fields are ignored */
	introspectionMode: IntrospectionMode;
	/** Whether repeated ignored fields on a path should increment depth */
	limitIgnoredRecursion: boolean;
	/** Whether to bail immediately on violation (when no callback needs true depth) */
	shortCircuit: boolean;
	/** Whether to check for `@depth` directives on fields */
	useDirective: boolean;
}

/**
 * Calculates the depth of a GraphQL query AST node using iterative DFS.
 *
 * Handles three selection types:
 * - **Fields**: Increment depth by 1 for composite (non-scalar) fields
 * - **Fragment spreads**: Expand the fragment in-place (no depth increment)
 * - **Inline fragments**: Process in-place (no depth increment)
 *
 * Fragment cycle detection uses per-path visited sets so that the same
 * fragment reused at different depths is calculated correctly.
 *
 * When `shortCircuit` is enabled (no callback), the engine bails immediately
 * on the first violation instead of traversing the full subtree.
 *
 * Uses an explicit stack instead of recursion to prevent stack overflow
 * on deeply nested queries.
 *
 * @param caches - Shared caches for interface and directive lookups
 * @param config - Immutable traversal configuration
 * @param fragments - Map of all fragment definitions in the document
 * @param maxDepth - Maximum allowed depth for this branch
 * @param node - The AST node to calculate depth for
 * @param parentType - Root type for field resolution
 * @param schema - GraphQL schema for type resolution
 * @returns The maximum depth and the deepest violation found
 */
function calculateDepth(
	caches: TraversalCaches,
	config: TraversalConfig,
	fragments: Map<string, FragmentDefinitionNode>,
	maxDepth: number,
	node: ASTNode & { selectionSet?: { selections: readonly SelectionNode[] } },
	parentType: GraphQLOutputType | undefined,
	schema: GraphQLSchema | undefined,
): DepthResult {
	let deepestViolation: DepthViolation | null = null;
	let globalMaxDepth = 0;

	if (!node.selectionSet) {
		return { depth: 0, violation: null };
	}

	const stack: StackFrame[] = [
		{
			currentDepth: 0,
			hasDirectiveLimit: false,
			ignoredFieldsOnPath: new Set<string>(),
			maxDepth,
			node,
			parentType,
			path: undefined,
			visitedFragments: new Set<string>(),
		},
	];

	for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
		if (!frame.node.selectionSet) {
			continue;
		}

		for (const selection of frame.node.selectionSet.selections) {
			switch (selection.kind) {
				case Kind.FIELD: {
					const fieldName = selection.name.value;
					const isIntrospectionField = fieldName.startsWith("__");

					// When introspection is fully ignored, always skip the subtree
					// regardless of ignoreMode.
					if (config.introspectionMode === "all" && isIntrospectionField) {
						continue;
					}

					// Leaf fields (no selectionSet) never contribute to depth,
					// so skip them before running ignore rules to avoid unnecessary
					// predicate evaluation and potential errors on irrelevant fields.
					if (!selection.selectionSet) {
						continue;
					}

					const isIgnored = shouldIgnoreField(
						fieldName,
						config.ignore,
						config.caseInsensitiveIgnore,
						config.introspectionMode,
					);

					if (isIgnored && config.ignoreMode === "skip") {
						continue;
					}

					// Resolve field type and directive depth
					let fieldMaxDepth = frame.maxDepth;
					let fieldType: GraphQLOutputType | undefined;
					let hasDirectiveLimit = frame.hasDirectiveLimit;

					if (schema && frame.parentType) {
						const namedType = getNamedType(frame.parentType);
						if (isObjectType(namedType) || isInterfaceType(namedType)) {
							const fieldDef = namedType.getFields()[fieldName];
							if (fieldDef) {
								fieldType = fieldDef.type;

								// Defensively skip non-composite fields that erroneously
								// have selections (normally caught by GraphQL's own
								// validation rules, but guards against miscounted depth
								// when this rule runs standalone or before other rules).
								const resolvedType = getNamedType(fieldType);
								if (resolvedType && !isCompositeType(resolvedType)) {
									continue;
								}

								if (config.useDirective) {
									const resolved = resolveFieldDirectiveDepth(
										caches,
										config,
										frame.currentDepth,
										frame.maxDepth,
										fieldDef,
										frame.hasDirectiveLimit,
										namedType,
									);
									fieldMaxDepth = resolved.maxDepth;
									hasDirectiveLimit = resolved.hasDirectiveLimit;
								}
							}
						}
					}

					// Determine whether this ignored field should still increment
					// depth due to the recursion guard detecting repeated ignores
					// on the same path. The key is type-aware (`Type:field`) when
					// a schema is present so identically named fields on unrelated
					// types are tracked independently. Without a schema, the key
					// uses the field name alone, which may cause conservative
					// over-counting on paths with same-named fields on different types.
					let ignoredFieldsOnPath = frame.ignoredFieldsOnPath;
					let effectivelyIgnored = isIgnored;

					if (isIgnored && config.limitIgnoredRecursion) {
						const parentName = frame.parentType ? getNamedType(frame.parentType)?.name : undefined;
						const recursionKey = parentName ? `${parentName}:${fieldName}` : fieldName;

						if (ignoredFieldsOnPath.has(recursionKey)) {
							// Same type:field was already ignored on this path — increment depth
							effectivelyIgnored = false;
						} else {
							// First occurrence — track it for subsequent path segments
							ignoredFieldsOnPath = new Set(ignoredFieldsOnPath);
							ignoredFieldsOnPath.add(recursionKey);
						}
					}

					const newDepth = effectivelyIgnored ? frame.currentDepth : frame.currentDepth + 1;

					// Use alias for path (matches the response shape clients see),
					// while fieldName is used for schema lookups and ignore rules.
					const pathSegment = selection.alias?.value ?? fieldName;
					const fieldPath = pathPush(frame.path, pathSegment);

					// Track maximum depth found
					if (newDepth > globalMaxDepth) {
						globalMaxDepth = newDepth;
					}

					// Check for violation
					if (newDepth > fieldMaxDepth) {
						const violation: DepthViolation = {
							depth: newDepth,
							maxDepth: fieldMaxDepth,
							node: selection,
							path: pathToArray(fieldPath),
						};

						if (config.shortCircuit) {
							return { depth: newDepth, violation };
						}

						if (!deepestViolation || violation.depth > deepestViolation.depth) {
							deepestViolation = violation;
						}
					}

					// Push children onto stack
					stack.push({
						currentDepth: newDepth,
						hasDirectiveLimit,
						ignoredFieldsOnPath,
						maxDepth: fieldMaxDepth,
						node: selection,
						parentType: fieldType,
						path: fieldPath,
						visitedFragments: frame.visitedFragments,
					});
					break;
				}

				case Kind.FRAGMENT_SPREAD: {
					const fragmentName = selection.name.value;

					// Check membership before copying to avoid wasted allocations
					// when the fragment was already visited on this path.
					if (frame.visitedFragments.has(fragmentName)) {
						continue;
					}

					const fragment = fragments.get(fragmentName);
					if (!fragment) {
						continue;
					}

					// Create independent copy for per-path cycle detection
					const fragmentVisited = new Set(frame.visitedFragments);
					fragmentVisited.add(fragmentName);

					const parentType = fragment.typeCondition
						? resolveTypeCondition(fragment.typeCondition.name.value, schema, frame.parentType)
						: frame.parentType;

					stack.push({
						currentDepth: frame.currentDepth,
						hasDirectiveLimit: frame.hasDirectiveLimit,
						ignoredFieldsOnPath: frame.ignoredFieldsOnPath,
						maxDepth: frame.maxDepth,
						node: fragment,
						parentType,
						path: frame.path,
						visitedFragments: fragmentVisited,
					});
					break;
				}

				case Kind.INLINE_FRAGMENT: {
					const parentType = selection.typeCondition
						? resolveTypeCondition(selection.typeCondition.name.value, schema, frame.parentType)
						: frame.parentType;

					stack.push({
						currentDepth: frame.currentDepth,
						hasDirectiveLimit: frame.hasDirectiveLimit,
						ignoredFieldsOnPath: frame.ignoredFieldsOnPath,
						maxDepth: frame.maxDepth,
						node: selection,
						parentType,
						path: frame.path,
						visitedFragments: frame.visitedFragments,
					});
					break;
				}

				default: {
					const exhaustiveCheck: never = selection;
					throw new Error(`Unhandled selection kind: ${(exhaustiveCheck as SelectionNode).kind}`);
				}
			}
		}
	}

	return { depth: globalMaxDepth, violation: deepestViolation };
}

/**
 * Collects all interfaces implemented by a type, including transitively
 * inherited interfaces (interface-implements-interface chains).
 *
 * @param type - The object or interface type to collect interfaces from
 * @returns All directly and transitively implemented interfaces
 */
function collectInterfaces(type: GraphQLInterfaceType | GraphQLObjectType): GraphQLInterfaceType[] {
	const interfaces: GraphQLInterfaceType[] = [];
	const seen = new Set<string>();
	const stack = [...type.getInterfaces()];

	for (let iface = stack.pop(); iface !== undefined; iface = stack.pop()) {
		if (seen.has(iface.name)) {
			continue;
		}

		seen.add(iface.name);
		interfaces.push(iface);

		for (const parent of iface.getInterfaces()) {
			if (!seen.has(parent.name)) {
				stack.push(parent);
			}
		}
	}

	return interfaces;
}

/**
 * Creates empty traversal caches for a new validation run.
 *
 * @returns Fresh caches for interface and directive lookups
 */
function createTraversalCaches(): TraversalCaches {
	return {
		directiveDepths: new Map<string, number | undefined>(),
		interfaces: new Map<string, GraphQLInterfaceType[]>(),
	};
}

/**
 * Extracts all fragment and operation definitions from a GraphQL document
 * in a single pass.
 *
 * **By design:** Duplicate fragment names are silently overwritten (last wins)
 * rather than raising a validation error. This is intentional — detecting
 * duplicates is the responsibility of GraphQL's built-in `UniqueFragmentNamesRule`,
 * not a depth-limiting rule. When both rules run together (the normal case),
 * duplicates are already caught before this code executes. When used standalone,
 * last-wins is a safe, deterministic fallback that avoids coupling depth
 * validation to fragment uniqueness concerns.
 *
 * @param definitions - Array of definition nodes from the parsed document
 * @returns Fragment map and operation array
 */
function extractDefinitions(definitions: readonly DefinitionNode[]): {
	fragments: Map<string, FragmentDefinitionNode>;
	operations: OperationDefinitionNode[];
} {
	const fragments = new Map<string, FragmentDefinitionNode>();
	const operations: OperationDefinitionNode[] = [];

	for (const definition of definitions) {
		if (definition.kind === Kind.FRAGMENT_DEFINITION) {
			fragments.set(definition.name.value, definition);
		} else if (definition.kind === Kind.OPERATION_DEFINITION) {
			operations.push(definition);
		}
	}

	return { fragments, operations };
}

/**
 * Returns cached interfaces for a type, computing and caching on first access.
 *
 * @param caches - Traversal caches
 * @param type - The object or interface type to get interfaces for
 * @returns All directly and transitively implemented interfaces
 */
function getCachedInterfaces(
	caches: TraversalCaches,
	type: GraphQLInterfaceType | GraphQLObjectType,
): GraphQLInterfaceType[] {
	const cached = caches.interfaces.get(type.name);
	if (cached !== undefined) {
		return cached;
	}

	const result = collectInterfaces(type);
	caches.interfaces.set(type.name, result);
	return result;
}

/**
 * Creates a new path node by appending a segment to the parent path.
 *
 * @param parent - Parent path node, or `undefined` for the root
 * @param segment - Field name or alias for this path segment
 * @returns New path node linked to the parent
 */
function pathPush(parent: PathNode | undefined, segment: string): PathNode {
	return { parent, segment };
}

/**
 * Materializes a linked-list path into a string array.
 *
 * @param node - Leaf path node to materialize from
 * @returns Array of path segments from root to leaf
 */
function pathToArray(node: PathNode | undefined): string[] {
	const result: string[] = [];
	let current = node;
	while (current) {
		result.push(current.segment);
		current = current.parent;
	}
	result.reverse();
	return result;
}

/**
 * Resolves a `@depth` directive on a field definition, falling back to
 * interface field directives when the concrete field has none.
 *
 * **Precedence:** The concrete field's directive takes priority. Interface
 * directives are only consulted when the concrete field has no `@depth`.
 * When multiple interfaces define `@depth` on the same field, the strictest
 * (minimum) value wins.
 *
 * Results are memoized per `typeName:fieldName` in the traversal caches
 * to avoid repeated interface graph walks on large schemas.
 *
 * @param caches - Traversal caches for memoizing lookups
 * @param config - Traversal configuration
 * @param currentDepth - Current depth in the query tree
 * @param currentMaxDepth - Current maximum depth for this branch
 * @param fieldDef - The field definition to inspect
 * @param hasDirectiveLimit - Whether a directive has already constrained this path
 * @param namedType - The named parent type owning this field (already unwrapped)
 * @returns Resolved maximum depth and directive limit state
 */
function resolveFieldDirectiveDepth(
	caches: TraversalCaches,
	config: TraversalConfig,
	currentDepth: number,
	currentMaxDepth: number,
	fieldDef: GraphQLField<unknown, unknown>,
	hasDirectiveLimit: boolean,
	namedType: GraphQLInterfaceType | GraphQLObjectType,
): DirectiveResolution {
	const cacheKey = `${namedType.name}:${fieldDef.name}`;

	let directiveDepth: number | undefined;

	if (caches.directiveDepths.has(cacheKey)) {
		directiveDepth = caches.directiveDepths.get(cacheKey);
	} else {
		directiveDepth = getDepthFromDirective(fieldDef);

		if (directiveDepth === undefined) {
			const interfaces = getCachedInterfaces(caches, namedType);
			for (const iface of interfaces) {
				const ifaceField = iface.getFields()[fieldDef.name];
				const ifaceDepth = getDepthFromDirective(ifaceField);
				if (ifaceDepth !== undefined) {
					directiveDepth =
						directiveDepth === undefined ? ifaceDepth : Math.min(directiveDepth, ifaceDepth);
				}
			}
		}

		caches.directiveDepths.set(cacheKey, directiveDepth);
	}

	if (directiveDepth !== undefined) {
		const relativeMax = currentDepth + directiveDepth;
		const maxDepth =
			config.directiveMode === "cap"
				? Math.min(currentMaxDepth, relativeMax)
				: hasDirectiveLimit
					? Math.min(currentMaxDepth, relativeMax)
					: relativeMax;
		return { hasDirectiveLimit: true, maxDepth };
	}

	return { hasDirectiveLimit, maxDepth: currentMaxDepth };
}

/**
 * Resolves the parent type from a type condition on a fragment or inline fragment.
 *
 * Falls back to `currentParentType` when the schema is unavailable or the
 * type condition resolves to a non-composite type (which GraphQL's own
 * validation would reject, but is handled defensively here).
 *
 * @param typeConditionName - The name of the type condition
 * @param schema - GraphQL schema for type lookup
 * @param currentParentType - Fallback parent type if resolution fails
 * @returns The resolved composite type or the current parent type
 */
function resolveTypeCondition(
	typeConditionName: string,
	schema: GraphQLSchema | undefined,
	currentParentType: GraphQLOutputType | undefined,
): GraphQLOutputType | undefined {
	if (schema) {
		const type = schema.getType(typeConditionName);
		if (type && isCompositeType(type)) {
			return type;
		}
	}
	return currentParentType;
}

export { calculateDepth, createTraversalCaches, extractDefinitions };
export type { DepthResult, TraversalCaches, TraversalConfig };
