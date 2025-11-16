import {
  type ASTNode,
  type DefinitionNode,
  type FieldNode,
  type FragmentDefinitionNode,
  type FragmentSpreadNode,
  GraphQLError,
  type GraphQLField,
  type GraphQLOutputType,
  type GraphQLSchema,
  getNamedType,
  type InlineFragmentNode,
  isCompositeType,
  Kind,
  type OperationDefinitionNode,
  type SelectionNode,
  type ValidationContext,
} from "graphql";
import type { DepthCallback, DepthLimitOptions, IgnoreRule } from "./types.js";

/**
 * Determines whether a field should be ignored in depth calculation.
 *
 * @param fieldName - The name of the field to check
 * @param ignore - Array of ignore rules (strings, RegExp, or functions)
 * @param caseInsensitive - Whether to perform case-insensitive matching for string rules
 * @returns True if the field should be ignored, false otherwise
 */
function shouldIgnoreField(
  fieldName: string,
  ignore?: IgnoreRule[],
  caseInsensitive = false,
): boolean {
  // Always ignore introspection fields
  if (fieldName.startsWith("__")) {
    return true;
  }

  if (!ignore || ignore.length === 0) {
    return false;
  }

  for (const rule of ignore) {
    if (typeof rule === "string") {
      const matches = caseInsensitive
        ? rule.toLowerCase() === fieldName.toLowerCase()
        : rule === fieldName;
      if (matches) {
        return true;
      }
    } else if (rule instanceof RegExp) {
      if (rule.test(fieldName)) {
        return true;
      }
    } else if (typeof rule === "function") {
      if (rule(fieldName)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extracts the depth limit from a @depth directive on a field definition.
 *
 * Note: This function only supports integer literals in the directive.
 * Variables (e.g., @depth(max: $var)) are not supported because variable
 * values are not available during the validation phase. Directives with
 * variables will be ignored and fall back to the global depth limit.
 *
 * @param field - The GraphQL field definition to check
 * @returns The max depth from the directive, or undefined if not found/invalid
 */
function getDepthFromDirective(
  field: GraphQLField<unknown, unknown> | undefined,
): number | undefined {
  if (!field?.astNode?.directives) {
    return undefined;
  }

  const depthDirective = field.astNode.directives.find(
    (d) => d.name.value === "depth",
  );

  if (!depthDirective?.arguments) {
    return undefined;
  }

  const maxArg = depthDirective.arguments.find(
    (arg) => arg.name.value === "max",
  );

  if (maxArg?.value.kind === "IntValue") {
    const directiveDepth = Number.parseInt(maxArg.value.value, 10);
    if (Number.isFinite(directiveDepth) && directiveDepth >= 0) {
      return directiveDepth;
    }
  }

  return undefined;
}

/**
 * Extracts all fragment definitions from a GraphQL document.
 *
 * @param definitions - Array of definition nodes from the GraphQL document
 * @returns Map of fragment names to their definitions
 */
function getFragments(
  definitions: readonly DefinitionNode[],
): Map<string, FragmentDefinitionNode> {
  const fragments = new Map<string, FragmentDefinitionNode>();

  for (const definition of definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.set(definition.name.value, definition);
    }
  }

  return fragments;
}

/**
 * Extracts all operation definitions from a GraphQL document.
 *
 * @param definitions - Array of definition nodes from the GraphQL document
 * @returns Array of operation definitions (queries, mutations, subscriptions)
 */
function getOperations(
  definitions: readonly DefinitionNode[],
): OperationDefinitionNode[] {
  return definitions.filter(
    (def): def is OperationDefinitionNode =>
      def.kind === Kind.OPERATION_DEFINITION,
  );
}

interface DepthViolation {
  depth: number;
  maxDepth: number;
}

/**
 * Context object for depth calculation
 * Groups related parameters to improve function signature readability
 */
interface DepthCalculationContext {
  /** Current depth in the query tree */
  currentDepth: number;
  /** Parent type for resolving field definitions */
  parentType: GraphQLOutputType | undefined;
  /** Set of fragment names visited in current path (for cycle detection) */
  visitedFragments: Set<string>;
}

/**
 * Options for depth calculation
 * Groups configuration parameters
 */
interface DepthCalculationOptions {
  /** Whether to check for @depth directives on fields */
  useDirective: boolean;
  /** Whether to use case-insensitive matching for string ignore rules */
  caseInsensitiveIgnore: boolean;
  /** Rules for fields to ignore in depth calculation */
  ignore: IgnoreRule[] | undefined;
}

/**
 * Recursively calculates the depth of a GraphQL query node.
 *
 * This function handles fragment spreads correctly by creating an independent copy
 * of the visited fragments set for each fragment path. This ensures:
 * 1. Fragments used at different depths are calculated correctly
 * 2. Circular fragment references are detected per-path, not globally
 * 3. The same fragment can be used multiple times without miscalculation
 *
 * @param node - The AST node to calculate depth for
 * @param fragments - Map of all fragment definitions in the document
 * @param schema - GraphQL schema for type resolution
 * @param maxDepth - Maximum allowed depth for this node
 * @param context - Context object containing current depth, parent type, and visited fragments
 * @param options - Options object containing configuration flags and ignore rules
 * @returns Object containing final depth and any violation found
 */
function calculateDepth(
  node: ASTNode & { selectionSet?: { selections: readonly SelectionNode[] } },
  fragments: Map<string, FragmentDefinitionNode>,
  schema: GraphQLSchema | undefined,
  maxDepth: number,
  context: DepthCalculationContext,
  options: DepthCalculationOptions,
): { depth: number; violation: DepthViolation | null } {
  const { currentDepth, parentType, visitedFragments } = context;
  const { useDirective, caseInsensitiveIgnore, ignore } = options;
  if (currentDepth > maxDepth) {
    return {
      depth: currentDepth,
      violation: { depth: currentDepth, maxDepth },
    };
  }

  if (!node.selectionSet) {
    return { depth: currentDepth, violation: null };
  }

  let maxChildDepth = currentDepth;
  let violation: DepthViolation | null = null;

  for (const selection of node.selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      const fieldNode = selection as FieldNode;
      const fieldName = fieldNode.name.value;

      if (shouldIgnoreField(fieldName, ignore, caseInsensitiveIgnore)) {
        continue;
      }

      if (fieldNode.selectionSet) {
        // Check for field-specific depth limit from @depth directive
        let fieldMaxDepth = maxDepth;
        let fieldType: GraphQLOutputType | undefined;

        if (schema && parentType) {
          const namedType = getNamedType(parentType);
          if (isCompositeType(namedType) && "getFields" in namedType) {
            const fieldDef = namedType.getFields()[fieldName];
            if (fieldDef) {
              fieldType = fieldDef.type;
              if (useDirective) {
                const directiveDepth = getDepthFromDirective(fieldDef);
                if (directiveDepth !== undefined) {
                  fieldMaxDepth = directiveDepth;
                }
              }
            }
          }
        }

        const result = calculateDepth(
          fieldNode,
          fragments,
          schema,
          fieldMaxDepth,
          {
            currentDepth: currentDepth + 1,
            parentType: fieldType,
            visitedFragments,
          },
          options,
        );

        if (result.violation && !violation) {
          violation = result.violation;
        }

        maxChildDepth = Math.max(maxChildDepth, result.depth);
      }
    } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const spreadNode = selection as FragmentSpreadNode;
      const fragmentName = spreadNode.name.value;

      // Create a copy of visitedFragments for this path to correctly handle
      // fragments used at different depths. This prevents the bug where a fragment
      // used multiple times would only be calculated based on first occurrence.
      const fragmentVisited = new Set(visitedFragments);

      if (fragmentVisited.has(fragmentName)) {
        // Fragment cycle detected - skip to prevent infinite recursion
        continue;
      }

      const fragment = fragments.get(fragmentName);
      if (fragment) {
        fragmentVisited.add(fragmentName);
        const result = calculateDepth(
          fragment,
          fragments,
          schema,
          maxDepth,
          {
            currentDepth,
            parentType,
            visitedFragments: fragmentVisited,
          },
          options,
        );

        if (result.violation && !violation) {
          violation = result.violation;
        }

        maxChildDepth = Math.max(maxChildDepth, result.depth);
      }
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      const inlineFragment = selection as InlineFragmentNode;
      // Inline fragments inherit the visitedFragments set since they don't have names
      // and cannot create cycles by themselves
      const result = calculateDepth(
        inlineFragment,
        fragments,
        schema,
        maxDepth,
        context,
        options,
      );

      if (result.violation && !violation) {
        violation = result.violation;
      }

      maxChildDepth = Math.max(maxChildDepth, result.depth);
    }
  }

  return { depth: maxChildDepth, violation };
}

/**
 * Creates a GraphQL validation rule that limits query depth.
 *
 * This helps prevent DoS attacks and resource exhaustion from excessively deep queries.
 * The depth limit can be configured globally and optionally overridden per-field using
 * the @depth directive.
 *
 * Security considerations:
 * - This validator correctly handles fragments used at different depths
 * - Circular fragment references are detected and handled per-path
 * - Introspection fields (__typename, __schema, etc.) are automatically ignored
 *
 * Limitations:
 * - Variables in @depth directives are not supported (falls back to global limit)
 * - Field names are case-sensitive by default (use caseInsensitiveIgnore option if needed)
 *
 * @param maxDepth - Maximum allowed depth for queries
 * @param options - Optional configuration (ignore rules, directive support, case sensitivity)
 * @param callback - Optional callback invoked with depth information for all operations
 * @returns A GraphQL validation rule function
 *
 * @example
 * ```typescript
 * import { depthLimit } from 'graphql-query-depth-limit-esm';
 * import { validate } from 'graphql';
 *
 * const validationRules = [
 *   depthLimit(5, {
 *     ignore: ['friends', /.*Connection$/],
 *     useDirective: true,
 *     caseInsensitiveIgnore: false
 *   })
 * ];
 *
 * const errors = validate(schema, query, validationRules);
 * ```
 */
export function depthLimit(
  maxDepth: number,
  options?: DepthLimitOptions,
  callback?: DepthCallback,
) {
  return function depthLimitValidationRule(context: ValidationContext) {
    const document = context.getDocument();
    const fragments = getFragments(document.definitions);
    const operations = getOperations(document.definitions);
    const depths: Record<string, number> = {};
    const schema = context.getSchema();

    const rootTypeMap = {
      mutation: schema.getMutationType() ?? undefined,
      query: schema.getQueryType() ?? undefined,
      subscription: schema.getSubscriptionType() ?? undefined,
    };

    for (const operation of operations) {
      const operationName = operation.name?.value || "anonymous";
      const visitedFragments = new Set<string>();
      const rootType = rootTypeMap[operation.operation];

      const result = calculateDepth(
        operation,
        fragments,
        schema,
        maxDepth,
        {
          currentDepth: 0,
          parentType: rootType,
          visitedFragments,
        },
        {
          caseInsensitiveIgnore: options?.caseInsensitiveIgnore ?? false,
          ignore: options?.ignore,
          useDirective: options?.useDirective ?? false,
        },
      );

      depths[operationName] = result.depth;

      // Report error if depth limit was exceeded (either field-specific or global)
      if (result.violation) {
        context.reportError(
          new GraphQLError(
            `'${operationName}' has depth ${result.violation.depth} which exceeds maximum operation depth of ${result.violation.maxDepth}`,
            {
              nodes: [operation],
            },
          ),
        );
      }
    }

    if (callback) {
      callback(depths);
    }

    return {};
  };
}
