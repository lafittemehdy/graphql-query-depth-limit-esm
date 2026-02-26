/**
 * Client-side depth analysis engine.
 *
 * Port of the real library's DFS algorithm for browser-based
 * visualization. Uses `parse` and `Kind` from the `graphql` package.
 *
 * @module analysis-engine
 */

import { type DocumentNode, Kind, parse } from "graphql";
import type { AnalysisResult, DepthOptions, DepthViolation, TreeNode } from "../types/analysis";

/**
 * Analyze a GraphQL query and produce depth analysis results
 * with tree data for visualization.
 */
export function analyzeQuery(queryString: string, options: DepthOptions): AnalysisResult {
  const maxDepth = options.maxDepth ?? 5;

  let doc: DocumentNode;
  try {
    doc = parse(queryString);
  } catch (err) {
    return {
      callbackPayload: null,
      depth: 0,
      error: (err as Error).message,
      operations: [],
      tree: null,
      violation: null,
    };
  }

  const fragments = new Map<
    string,
    {
      readonly selectionSet?: unknown;
      readonly typeCondition?: { readonly name?: { readonly value: string } };
    }
  >();
  const operations: Array<{
    readonly name?: { readonly value: string };
    readonly operation: string;
    readonly selectionSet?: unknown;
  }> = [];

  for (const def of doc.definitions) {
    if (def.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.set(def.name.value, def);
    } else if (def.kind === Kind.OPERATION_DEFINITION) {
      operations.push(def);
    }
  }

  if (operations.length === 0) {
    return {
      callbackPayload: null,
      depth: 0,
      error: "No operations found",
      operations: [],
      tree: null,
      violation: null,
    };
  }

  const callbackPayload: Record<string, number> = Object.create(null) as Record<string, number>;
  const operationResults: Array<{
    maxDepth: number;
    name: string;
    tree: TreeNode;
    violation: DepthViolation | null;
  }> = [];
  let firstViolation: DepthViolation | null = null;
  let globalMaxDepth = 0;

  for (const operation of operations) {
    const opName = operation.name?.value ?? "anonymous";
    const treeRoot: TreeNode = {
      alias: null,
      children: [],
      depth: 0,
      exceeded: false,
      fieldName: `${operation.operation} ${opName}`,
      ignored: false,
      isFragment: false,
      isInlineFragment: false,
      isLeaf: false,
      isOperation: true,
      path: [],
    };

    const result = walkOperation(operation, fragments, maxDepth, options, treeRoot);
    callbackPayload[opName] = result.maxDepth;
    operationResults.push({ name: opName, ...result, tree: treeRoot });

    if (result.maxDepth > globalMaxDepth) globalMaxDepth = result.maxDepth;
    if (result.violation && !firstViolation) firstViolation = result.violation;
  }

  return {
    callbackPayload,
    depth: globalMaxDepth,
    error: null,
    operations: operationResults,
    tree: operationResults.map((r) => r.tree),
    violation: firstViolation,
  };
}

/**
 * Determine whether a field should be ignored during depth calculation.
 *
 * Supports string rules with optional case-insensitive matching.
 * RegExp and function rules are not supported in the browser visualization
 * since ignore rules are entered as plain text in the UI.
 */
export function shouldIgnoreField(fieldName: string, options: DepthOptions): boolean {
  const mode = options.ignoreIntrospection ?? "typename";
  if (mode === "all" && fieldName.startsWith("__")) {
    return true;
  }
  if (mode === "typename" && fieldName === "__typename") {
    return true;
  }

  const ignoreRules = options.ignore ?? [];
  for (const rule of ignoreRules) {
    if (typeof rule === "string") {
      const match = options.caseInsensitiveIgnore
        ? fieldName.toLowerCase() === rule.toLowerCase()
        : fieldName === rule;
      if (match) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Internal types for the DFS stack
// ---------------------------------------------------------------------------

interface StackFrame {
  depth: number;
  /** Ignored field names seen on the current path (for recursion guard). */
  ignoredFieldsOnPath: Set<string>;
  // biome-ignore lint/suspicious/noExplicitAny: GraphQL AST nodes have varying shapes
  node: any;
  parentTreeNode: TreeNode;
  path: string[];
  visitedFragments: Set<string>;
}

/**
 * Walk a single operation using iterative DFS and build the tree data.
 */
function walkOperation(
  // biome-ignore lint/suspicious/noExplicitAny: GraphQL AST node
  operation: any,
  fragments: Map<string, unknown>,
  maxDepth: number,
  options: DepthOptions,
  treeRoot: TreeNode,
): { maxDepth: number; violation: DepthViolation | null } {
  const stack: StackFrame[] = [
    {
      depth: 0,
      ignoredFieldsOnPath: new Set(),
      node: operation,
      parentTreeNode: treeRoot,
      path: [],
      visitedFragments: new Set(),
    },
  ];

  let maxFoundDepth = 0;
  let violation: DepthViolation | null = null;

  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (!frame.node.selectionSet) continue;

    const selections = [...frame.node.selectionSet.selections].reverse();

    for (const selection of selections) {
      if (selection.kind === Kind.FIELD) {
        const fieldName: string = selection.name.value;
        const aliasName: string | undefined = selection.alias?.value;
        const displayName = aliasName ?? fieldName;
        const hasChildren = Boolean(selection.selectionSet);

        // Bug fix #4: When introspection is fully ignored ("all"),
        // skip the entire subtree — matching depth-engine.ts:199-201.
        const introspectionMode = options.ignoreIntrospection ?? "typename";
        if (introspectionMode === "all" && fieldName.startsWith("__")) {
          continue;
        }

        // Bug fix #5: Skip leaf fields before running ignore rules.
        // Leaf fields never contribute to depth, matching depth-engine.ts:206-208.
        if (!hasChildren) {
          const treeNode: TreeNode = {
            alias: aliasName ?? null,
            children: [],
            depth: frame.depth,
            exceeded: false,
            fieldName,
            ignored: false,
            isFragment: false,
            isInlineFragment: false,
            isLeaf: true,
            isOperation: false,
            path: [...frame.path, displayName],
          };
          frame.parentTreeNode.children.push(treeNode);
          continue;
        }

        const isIgnored = shouldIgnoreField(fieldName, options);

        // Bug fix #2: When ignoreMode is "skip", skip the entire subtree.
        if (isIgnored && (options.ignoreMode ?? "exclude") === "skip") {
          continue;
        }

        // Bug fix #3: limitIgnoredRecursion guard.
        // When enabled, if the same ignored field name appears again on the
        // current path, treat it as non-ignored (increment depth).
        let ignoredFieldsOnPath = frame.ignoredFieldsOnPath;
        let effectivelyIgnored = isIgnored;

        if (isIgnored && options.limitIgnoredRecursion) {
          if (ignoredFieldsOnPath.has(fieldName)) {
            effectivelyIgnored = false;
          } else {
            ignoredFieldsOnPath = new Set(ignoredFieldsOnPath);
            ignoredFieldsOnPath.add(fieldName);
          }
        }

        const newDepth = effectivelyIgnored ? frame.depth : frame.depth + 1;

        const treeNode: TreeNode = {
          alias: aliasName ?? null,
          children: [],
          depth: newDepth,
          exceeded: false,
          fieldName,
          ignored: isIgnored,
          isFragment: false,
          isInlineFragment: false,
          isLeaf: false,
          isOperation: false,
          path: [...frame.path, displayName],
        };

        if (newDepth > maxFoundDepth) maxFoundDepth = newDepth;

        if (newDepth > maxDepth && !violation) {
          treeNode.exceeded = true;
          violation = {
            depth: newDepth,
            maxDepth,
            operationName: treeNode.path[0] ?? "anonymous",
            path: treeNode.path,
          };
        } else if (newDepth > maxDepth) {
          treeNode.exceeded = true;
        }

        frame.parentTreeNode.children.push(treeNode);

        stack.push({
          depth: newDepth,
          ignoredFieldsOnPath,
          node: selection,
          parentTreeNode: treeNode,
          path: treeNode.path,
          visitedFragments: frame.visitedFragments,
        });
      } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
        const fragName: string = selection.name.value;

        if (frame.visitedFragments.has(fragName)) {
          const cycleNode: TreeNode = {
            alias: null,
            children: [],
            cycle: true,
            depth: frame.depth,
            exceeded: false,
            fieldName: `...${fragName}`,
            ignored: false,
            isFragment: true,
            isInlineFragment: false,
            isLeaf: true,
            isOperation: false,
            path: frame.path,
          };
          frame.parentTreeNode.children.push(cycleNode);
          continue;
        }

        const frag = fragments.get(fragName) as StackFrame["node"] | undefined;
        if (!frag) continue;

        const fragTreeNode: TreeNode = {
          alias: null,
          children: [],
          depth: frame.depth,
          exceeded: false,
          fieldName: `...${fragName}`,
          fragmentName: fragName,
          ignored: false,
          isFragment: true,
          isInlineFragment: false,
          isLeaf: false,
          isOperation: false,
          path: frame.path,
          typeName: frag.typeCondition?.name?.value ?? null,
        };

        frame.parentTreeNode.children.push(fragTreeNode);

        const newVisited = new Set(frame.visitedFragments);
        newVisited.add(fragName);

        stack.push({
          depth: frame.depth,
          ignoredFieldsOnPath: frame.ignoredFieldsOnPath,
          node: frag,
          parentTreeNode: fragTreeNode,
          path: frame.path,
          visitedFragments: newVisited,
        });
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        const typeName: string | null = selection.typeCondition?.name?.value ?? null;

        const inlineTreeNode: TreeNode = {
          alias: null,
          children: [],
          depth: frame.depth,
          exceeded: false,
          fieldName: typeName ? `... on ${typeName}` : "...",
          ignored: false,
          isFragment: false,
          isInlineFragment: true,
          isLeaf: false,
          isOperation: false,
          path: frame.path,
          typeName,
        };

        frame.parentTreeNode.children.push(inlineTreeNode);

        stack.push({
          depth: frame.depth,
          ignoredFieldsOnPath: frame.ignoredFieldsOnPath,
          node: selection,
          parentTreeNode: inlineTreeNode,
          path: frame.path,
          visitedFragments: frame.visitedFragments,
        });
      }
    }
  }

  return { maxDepth: maxFoundDepth, violation };
}
