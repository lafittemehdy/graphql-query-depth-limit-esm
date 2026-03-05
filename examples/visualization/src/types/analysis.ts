/** Result of analyzing a complete query document. */
export interface AnalysisResult {
  callbackPayload: Record<string, number> | null;
  depth: number;
  error: string | null;
  operations: OperationResult[];
  tree: TreeNode[] | null;
  violation: DepthViolation | null;
}

/** Analysis options configurable in the UI. */
export interface DepthOptions {
  caseInsensitiveIgnore?: boolean;
  ignore: string[];
  ignoreIntrospection: "all" | "none" | "typename";
  ignoreMode?: "exclude" | "skip";
  limitIgnoredRecursion?: boolean;
  maxDepth: number;
}

/** Violation detail when depth exceeds the limit. */
export interface DepthViolation {
  depth: number;
  maxDepth: number;
  operationName: string;
  path: string[];
}

/** Result of analyzing a single operation. */
export interface OperationResult {
  maxDepth: number;
  name: string;
  tree: TreeNode;
  violation: DepthViolation | null;
}

/** A preset query with display metadata. */
export interface Preset {
  description: string;
  id: string;
  label: string;
  options: DepthOptions;
  query: string;
}

/** A single node in the depth analysis tree. */
export interface TreeNode {
  alias: string | null;
  children: TreeNode[];
  cycle?: boolean;
  depth: number;
  exceeded: boolean;
  fieldName: string;
  fragmentName?: string;
  ignored: boolean;
  isFragment: boolean;
  isInlineFragment: boolean;
  isLeaf: boolean;
  isOperation: boolean;
  path: string[];
  typeName?: string | null;
}
