/**
 * DOM-based AST tree visualization with depth badges and expand/collapse.
 *
 * Supports a `revealDepth` prop for the intro animation: nodes deeper
 * than the reveal threshold are dimmed, creating a progressive
 * "descent" effect as levels light up one by one.
 *
 * @module TreeView
 */

import { memo, useCallback, useState } from "react";

import { depthBadgeClass } from "../lib/utils";
import type { AnalysisResult, TreeNode } from "../types/analysis";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TreeViewProps {
  maxDepth: number;
  result: AnalysisResult | null;
  /** When set, nodes deeper than this value are dimmed (animation mode). */
  revealDepth?: number | null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** Tree viewport showing parsed AST operations as an interactive nested tree. */
export function TreeView({ maxDepth, result, revealDepth }: TreeViewProps) {
  if (!result || !result.tree || result.tree.length === 0) {
    const isError = result?.error && !result.tree;
    return (
      <main className="tree-viewport">
        <div className="tree-empty">
          <div aria-hidden="true" className="tree-empty-icon">
            &#9651;
          </div>
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
      <div className="tree-container" role="tree">
        {result.tree.map((root, i) => (
          <TreeNodeView
            key={`${root.fieldName}-${i}`}
            maxDepth={maxDepth}
            node={root}
            revealDepth={revealDepth}
          />
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
  /** When set, nodes deeper than this value are dimmed. */
  revealDepth?: number | null;
}

/** Single tree node with expand/collapse and recursive children. */
const TreeNodeView = memo(function TreeNodeView({
  maxDepth,
  node,
  revealDepth,
}: TreeNodeViewProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isDimmed = revealDepth != null && node.depth > revealDepth;

  const handleToggle = useCallback(() => {
    if (hasChildren) setExpanded((prev) => !prev);
  }, [hasChildren]);

  const headerClasses = [
    "tree-node-header",
    node.exceeded ? "exceeded" : "",
    node.ignored ? "ignored" : "",
    isDimmed ? "anim-dimmed" : "",
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleToggle();
      }
    },
    [handleToggle],
  );

  return (
    <div className="tree-node">
      <div
        aria-expanded={hasChildren ? expanded : undefined}
        aria-label={node.fieldName}
        className={headerClasses}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        role="treeitem"
        tabIndex={0}
      >
        {/* Toggle arrow */}
        <span
          aria-hidden="true"
          className={`tree-toggle${hasChildren ? "" : " leaf"}${!expanded ? " collapsed" : ""}`}
        >
          {hasChildren ? "\u25BC" : "\u00B7"}
        </span>

        {/* Fragment icon */}
        {(node.isFragment || node.isInlineFragment) && (
          <span aria-hidden="true" className="tree-fragment-icon">
            {"\u25C7"}
          </span>
        )}

        {/* Field name */}
        {node.alias ? (
          <span className={nameClasses}>
            <span className="tree-alias">{node.alias}:</span> {node.fieldName}
          </span>
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
        // biome-ignore lint/a11y/useSemanticElements: role="group" is the correct WAI-ARIA tree pattern
        <div className={`tree-node-children${expanded ? "" : " collapsed"}`} role="group">
          {node.children.map((child, i) => (
            <TreeNodeView
              key={`${child.fieldName}-${i}`}
              maxDepth={maxDepth}
              node={child}
              revealDepth={revealDepth}
            />
          ))}
        </div>
      )}
    </div>
  );
});
