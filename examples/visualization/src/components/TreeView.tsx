/**
 * DOM-based AST tree visualization with depth badges and expand/collapse.
 *
 * @module TreeView
 */

import { memo, useCallback, useState } from "react";
import { depthBadgeClass, escapeHtml } from "../lib/utils";
import type { AnalysisResult, TreeNode } from "../types/analysis";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TreeViewProps {
  maxDepth: number;
  result: AnalysisResult | null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** Tree viewport showing parsed AST operations as an interactive nested tree. */
export function TreeView({ maxDepth, result }: TreeViewProps) {
  if (!result || !result.tree || result.tree.length === 0) {
    const isError = result?.error && !result.tree;
    return (
      <main className="tree-viewport">
        <div className="tree-empty">
          <div className="tree-empty-icon">&#9651;</div>
          <div className="tree-empty-title">
            {isError ? "Parse Error" : "Query Depth Visualizer"}
          </div>
          <div className="tree-empty-hint">
            {isError
              ? result.error
              : "Write a query or select a preset to visualize depth analysis"}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="tree-viewport">
      <div className="tree-container">
        {result.tree.map((root, i) => (
          <TreeNodeView key={`${root.fieldName}-${i}`} maxDepth={maxDepth} node={root} />
        ))}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Recursive tree node
// ---------------------------------------------------------------------------

interface TreeNodeViewProps {
  maxDepth: number;
  node: TreeNode;
}

/** Single tree node with expand/collapse and recursive children. */
const TreeNodeView = memo(function TreeNodeView({ maxDepth, node }: TreeNodeViewProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  const handleToggle = useCallback(() => {
    if (hasChildren) setExpanded((prev) => !prev);
  }, [hasChildren]);

  const headerClasses = [
    "tree-node-header",
    node.exceeded ? "exceeded" : "",
    node.ignored ? "ignored" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const nameClasses = [
    "tree-field-name",
    node.isOperation ? "operation" : "",
    node.isFragment ? "fragment" : "",
    node.isInlineFragment ? "inline-fragment" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const showBadge =
    !node.isLeaf &&
    !node.isOperation &&
    !node.isFragment &&
    !node.isInlineFragment &&
    !node.ignored;

  return (
    <div className="tree-node">
      <div className={headerClasses} onClick={handleToggle}>
        {/* Toggle arrow */}
        <span
          className={`tree-toggle${hasChildren ? "" : " leaf"}${!expanded ? " collapsed" : ""}`}
        >
          {hasChildren ? "\u25BC" : "\u00B7"}
        </span>

        {/* Fragment icon */}
        {(node.isFragment || node.isInlineFragment) && (
          <span className="tree-fragment-icon">{"\u25C7"}</span>
        )}

        {/* Field name */}
        {node.alias ? (
          <span
            className={nameClasses}
            dangerouslySetInnerHTML={{
              __html: `<span class="tree-alias">${escapeHtml(node.alias)}:</span> ${escapeHtml(node.fieldName)}`,
            }}
          />
        ) : (
          <span className={nameClasses}>{node.fieldName}</span>
        )}

        {/* Type name for fragments */}
        {node.typeName && !node.isOperation && (
          <span className="tree-leaf-type">{node.typeName}</span>
        )}

        {/* Cycle warning */}
        {node.cycle && <span className="tree-cycle-warning">CYCLE</span>}

        {/* Depth badge */}
        {showBadge && (
          <span className={`tree-depth-badge ${depthBadgeClass(node.depth, maxDepth)}`}>
            {node.depth}
          </span>
        )}

        {/* Ignored label */}
        {node.ignored && <span className="tree-ignored-label">IGNORED</span>}

        {/* Leaf indicator */}
        {node.isLeaf && !node.isFragment && !node.cycle && (
          <span className="tree-leaf-type">scalar</span>
        )}
      </div>

      {/* Children */}
      {hasChildren && (
        <div className={`tree-node-children${expanded ? "" : " collapsed"}`}>
          {node.children.map((child, i) => (
            <TreeNodeView key={`${child.fieldName}-${i}`} maxDepth={maxDepth} node={child} />
          ))}
        </div>
      )}
    </div>
  );
});
