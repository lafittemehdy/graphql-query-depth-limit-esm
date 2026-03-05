/**
 * Shared utility functions: clipboard, escaping, color classification.
 *
 * @module utils
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Duration (ms) to show the "Copied!" feedback before resetting. */
export const COPY_FEEDBACK_MS = 1500;

/** Debounce delay (ms) for analysis re-computation on query changes. */
export const ANALYSIS_DEBOUNCE_MS = 200;

/** Ratio threshold (depth / maxDepth) above which a badge turns "warn". */
const WARNING_THRESHOLD = 0.6;

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
  if (ratio > WARNING_THRESHOLD) return "warn";
  return "safe";
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
  if (ratio > WARNING_THRESHOLD) return "warn";
  return "safe";
}

// ---------------------------------------------------------------------------
// Intro state persistence
// ---------------------------------------------------------------------------

const INTRO_DISABLED_KEY = "gqd-intro-disabled";

/** Check whether the user has permanently disabled the intro prompt. */
export function isIntroDisabled(): boolean {
  try {
    return localStorage.getItem(INTRO_DISABLED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Permanently disable the intro prompt on future reloads. */
export function disableIntro(): void {
  try {
    localStorage.setItem(INTRO_DISABLED_KEY, "1");
  } catch {
    // Ignore storage errors
  }
}
