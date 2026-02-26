/**
 * Shared utility functions: clipboard, escaping, color classification.
 *
 * @module utils
 */

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

/** Copy text to clipboard and invoke the success callback. */
export function copyToClipboard(text: string, onSuccess: () => void): void {
  navigator.clipboard.writeText(text).then(onSuccess);
}

// ---------------------------------------------------------------------------
// Depth badge classification
// ---------------------------------------------------------------------------

/** Return a CSS class for a depth badge based on ratio to max depth. */
export function depthBadgeClass(depth: number, maxDepth: number): "crit" | "safe" | "warn" {
  const ratio = maxDepth > 0 ? depth / maxDepth : 0;
  if (ratio > 1) return "crit";
  if (ratio > 0.6) return "warn";
  return "safe";
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

/** Escape HTML special characters for safe insertion into innerHTML. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Text input detection
// ---------------------------------------------------------------------------

/** Check whether an element is a text input (to suppress keyboard shortcuts). */
export function isTextInput(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "SELECT" ||
    el.tagName === "TEXTAREA"
  );
}

// ---------------------------------------------------------------------------
// Pressure gauge classification
// ---------------------------------------------------------------------------

/** Return a CSS class for the pressure gauge fill bar. */
export function pressureClass(depth: number, maxDepth: number): "crit" | "safe" | "warn" {
  if (depth > maxDepth) return "crit";
  const ratio = maxDepth > 0 ? depth / maxDepth : 0;
  if (ratio > 0.6) return "warn";
  return "safe";
}
