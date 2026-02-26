/**
 * Hook that runs depth analysis on debounced query text and options.
 *
 * @module useAnalysis
 */

import { useMemo } from "react";
import { analyzeQuery } from "../lib/analysis-engine";
import type { AnalysisResult, DepthOptions } from "../types/analysis";
import { useDebouncedValue } from "./useDebouncedValue";

/** Analyze `queryText` with `options` using 200ms debounce on text changes. */
export function useAnalysis(queryText: string, options: DepthOptions): AnalysisResult | null {
  const debouncedText = useDebouncedValue(queryText, 200);

  return useMemo(() => {
    if (!debouncedText.trim()) return null;
    return analyzeQuery(debouncedText, options);
  }, [debouncedText, options]);
}
