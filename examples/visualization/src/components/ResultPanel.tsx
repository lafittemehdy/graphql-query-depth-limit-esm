/**
 * Result panel — depth gauge, pass/fail badge, error details, JSON output.
 *
 * @module ResultPanel
 */

import { useCallback, useState } from "react";

import { COPY_FEEDBACK_MS, copyToClipboard, pressureClass } from "../lib/utils";
import type { AnalysisResult, DepthOptions } from "../types/analysis";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ResultPanelProps {
  /** When false, hide the status badge (animation mode). */
  badgeVisible?: boolean;
  /** Override displayed depth in the gauge (animation mode). */
  depthOverride?: number | null;
  onClose: () => void;
  open: boolean;
  options: DepthOptions;
  result: AnalysisResult | null;
  /** Apply shake animation to the result badge (animation mode). */
  shaking?: boolean;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** Right-side result panel with gauge, status badge, and structured output. */
export function ResultPanel({
  badgeVisible = true,
  depthOverride,
  onClose,
  open,
  options,
  result,
  shaking = false,
}: ResultPanelProps) {
  const depth = depthOverride ?? result?.depth ?? 0;
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
            <span aria-hidden="true" className="gauge-separator">
              /
            </span>
            <span className="gauge-max">{maxDepth}</span>
          </div>
          <div
            aria-label={`Query depth ${depth} of ${maxDepth}`}
            aria-valuemax={maxDepth}
            aria-valuemin={0}
            aria-valuenow={depth}
            className="pressure-meter"
            role="progressbar"
          >
            <div className="pressure-track">
              <div className={fillClass} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Status Badge */}
      <div className="result-section">
        <div className="section-title">Result</div>
        {badgeVisible ? (
          <StatusBadge options={options} result={result} shaking={shaking} />
        ) : (
          <output className="result-badge idle">Analyzing...</output>
        )}
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
  shaking = false,
}: {
  options: DepthOptions;
  result: AnalysisResult | null;
  shaking?: boolean;
}) {
  if (!result) {
    return (
      <output aria-live="polite" className="result-badge idle">
        Awaiting query...
      </output>
    );
  }

  if (result.error && !result.tree) {
    return (
      <output
        aria-live="polite"
        className="result-badge fail"
      >{`ERROR \u2014 ${result.error}`}</output>
    );
  }

  if (result.violation) {
    const v = result.violation;
    return (
      <output aria-live="polite" className={`result-badge fail${shaking ? " shaking" : ""}`}>
        {`BLOCKED \u2014 depth ${v.depth} exceeds max ${v.maxDepth}`}
        <div className="result-badge-path">{v.path.join(".")}</div>
      </output>
    );
  }

  return (
    <output aria-live="polite" className="result-badge pass">
      {`PASS \u2014 depth ${result.depth} / max ${options.maxDepth}`}
    </output>
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
        <span className="error-value path">{violation.path.join(".")}</span>
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
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    });
  }, [getText]);

  return (
    <button
      aria-label={copied ? "Copied!" : "Copy JSON"}
      className="copy-btn"
      onClick={handleCopy}
      type="button"
    >
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
