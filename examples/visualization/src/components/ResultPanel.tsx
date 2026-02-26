/**
 * Result panel — depth gauge, pass/fail badge, error details, JSON output.
 *
 * @module ResultPanel
 */

import { useCallback, useState } from "react";
import { copyToClipboard, escapeHtml, pressureClass } from "../lib/utils";
import type { AnalysisResult, DepthOptions } from "../types/analysis";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ResultPanelProps {
  onClose: () => void;
  open: boolean;
  options: DepthOptions;
  result: AnalysisResult | null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** Right-side result panel with gauge, status badge, and structured output. */
export function ResultPanel({ onClose, open, options, result }: ResultPanelProps) {
  const depth = result?.depth ?? 0;
  const maxDepth = options.maxDepth;
  const pct = maxDepth > 0 ? Math.min((depth / maxDepth) * 100, 100) : 0;
  const fillClass = `pressure-fill ${depth > 0 ? pressureClass(depth, maxDepth) : ""}`.trim();

  return (
    <aside className={`result-panel${open ? " open" : ""}`}>
      <button
        aria-label="Close result panel"
        className="panel-close-btn"
        onClick={onClose}
        type="button"
      >
        &times;
      </button>

      {/* Depth Gauge */}
      <div className="result-section">
        <div className="section-title">Depth Gauge</div>
        <div className="gauge-display">
          <div className="gauge-values">
            <span className="gauge-current">{depth}</span>
            <span className="gauge-separator">/</span>
            <span className="gauge-max">{maxDepth}</span>
          </div>
          <div className="pressure-meter">
            <div className="pressure-track">
              <div className={fillClass} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Status Badge */}
      <div className="result-section">
        <div className="section-title">Result</div>
        <StatusBadge options={options} result={result} />
      </div>

      {/* Violation Details */}
      {result?.violation && (
        <div className="result-section">
          <div className="section-title">Violation Details</div>
          <ViolationDetails violation={result.violation} />
        </div>
      )}

      {/* Error Output */}
      {result?.violation && (
        <div className="result-section">
          <div className="section-title">
            Error Output
            <CopyButton getText={() => buildErrorJson(result.violation!)} />
          </div>
          <pre className="json-output">{buildErrorJson(result.violation)}</pre>
        </div>
      )}

      {/* Callback Payload */}
      {result?.callbackPayload && Object.keys(result.callbackPayload).length > 0 && (
        <div className="result-section">
          <div className="section-title">
            Callback Payload
            <CopyButton getText={() => JSON.stringify(result.callbackPayload, null, 2)} />
          </div>
          <pre className="json-output">{JSON.stringify(result.callbackPayload, null, 2)}</pre>
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({
  options,
  result,
}: {
  options: DepthOptions;
  result: AnalysisResult | null;
}) {
  if (!result) {
    return <div className="result-badge idle">Awaiting query...</div>;
  }

  if (result.error && !result.tree) {
    return <div className="result-badge fail">{`ERROR \u2014 ${result.error}`}</div>;
  }

  if (result.violation) {
    const v = result.violation;
    return (
      <div className="result-badge fail">
        {`BLOCKED \u2014 depth ${v.depth} exceeds max ${v.maxDepth}`}
        <div style={{ fontSize: "10px", marginTop: "4px", opacity: 0.7 }}>{v.path.join(".")}</div>
      </div>
    );
  }

  return (
    <div className="result-badge pass">
      {`PASS \u2014 depth ${result.depth} / max ${options.maxDepth}`}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Violation Details
// ---------------------------------------------------------------------------

function ViolationDetails({ violation }: { violation: NonNullable<AnalysisResult["violation"]> }) {
  return (
    <div className="error-details">
      <ErrorRow label="Operation" value={violation.operationName} />
      <ErrorRow label="Depth" value={String(violation.depth)} />
      <ErrorRow label="Max" value={String(violation.maxDepth)} />
      <div className="error-row">
        <span className="error-label">Path</span>
        <span
          className="error-value path"
          dangerouslySetInnerHTML={{ __html: escapeHtml(violation.path.join(".")) }}
        />
      </div>
    </div>
  );
}

function ErrorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="error-row">
      <span className="error-label">{label}</span>
      <span className="error-value">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copy Button
// ---------------------------------------------------------------------------

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    copyToClipboard(getText(), () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [getText]);

  return (
    <button className="copy-btn" onClick={handleCopy} title="Copy JSON" type="button">
      {copied ? "\u2713" : "\u2630"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildErrorJson(violation: NonNullable<AnalysisResult["violation"]>): string {
  const errorObj = {
    extensions: {
      code: "QUERY_TOO_DEEP",
      depth: violation.depth,
      maxDepth: violation.maxDepth,
      path: violation.path,
    },
    message: `'${violation.operationName}' has depth ${violation.depth} which exceeds maximum allowed depth of ${violation.maxDepth} (at ${violation.path.join(".")})`,
  };
  return JSON.stringify(errorObj, null, 2);
}
