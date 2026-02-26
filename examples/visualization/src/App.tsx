/**
 * Root application component — all state lives here.
 *
 * Layout: Header → (OptionsPanel + PresetBar + CodeEditor) | TreeView | ResultPanel
 *
 * Supports A/B comparison mode where two independent query+options
 * slots can be toggled and their results compared side by side.
 *
 * @module App
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { CodeEditor } from "./components/CodeEditor";
import { CompareTabs } from "./components/CompareTabs";
import { Header } from "./components/Header";
import { OptionsPanel } from "./components/OptionsPanel";
import { PresetBar } from "./components/PresetBar";
import { ResultPanel } from "./components/ResultPanel";
import { TreeView } from "./components/TreeView";
import { useAnalysis } from "./hooks/useAnalysis";
import { DEFAULT_PRESET_ID, PRESET_ORDER, PRESETS } from "./lib/presets";
import { isTextInput } from "./lib/utils";
import type { AnalysisResult, DepthOptions } from "./types/analysis";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_PRESET = PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!;
const SECONDARY_PRESET = PRESETS.find((p) => p.id === "attack")!;

function cloneOptions(opts: DepthOptions): DepthOptions {
  return { ...opts, ignore: [...opts.ignore] };
}

// ---------------------------------------------------------------------------
// Slot state for comparison mode
// ---------------------------------------------------------------------------

interface Slot {
  options: DepthOptions;
  query: string;
  result: AnalysisResult | null;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

/** Root application component. */
export function App() {
  // --- Core state ---
  const [activePresetId, setActivePresetId] = useState<string | null>(DEFAULT_PRESET_ID);
  const [activeSlot, setActiveSlot] = useState<"A" | "B">("A");
  const [compareMode, setCompareMode] = useState(false);
  const [mobileResultOpen, setMobileResultOpen] = useState(false);
  const [options, setOptions] = useState<DepthOptions>(cloneOptions(DEFAULT_PRESET.options));
  const [queryText, setQueryText] = useState(DEFAULT_PRESET.query);

  // --- Slot storage for comparison mode ---
  const [slots, setSlots] = useState<Record<"A" | "B", Slot>>({
    A: { options: cloneOptions(DEFAULT_PRESET.options), query: DEFAULT_PRESET.query, result: null },
    B: {
      options: cloneOptions(SECONDARY_PRESET.options),
      query: SECONDARY_PRESET.query,
      result: null,
    },
  });

  // --- Analysis ---
  const analysisResult = useAnalysis(queryText, options);

  // Store analysis result back into the active slot
  useEffect(() => {
    setSlots((prev) => ({
      ...prev,
      [activeSlot]: { ...prev[activeSlot], result: analysisResult },
    }));
  }, [activeSlot, analysisResult]);

  // --- Handlers ---

  const handlePresetSelect = useCallback((presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePresetId(presetId);
    setOptions(cloneOptions(preset.options));
    setQueryText(preset.query);
  }, []);

  const handleQueryChange = useCallback((text: string) => {
    setActivePresetId(null);
    setQueryText(text);
  }, []);

  const handleOptionsChange = useCallback((newOptions: DepthOptions) => {
    setOptions(newOptions);
  }, []);

  const handleCompareToggle = useCallback(() => {
    setCompareMode((prev) => {
      if (prev) {
        // Exiting compare: restore slot A
        setActiveSlot("A");
        setOptions(cloneOptions(slots.A.options));
        setQueryText(slots.A.query);
      } else {
        // Entering compare: save current state to slot A
        setSlots((s) => ({
          ...s,
          A: { ...s.A, options: cloneOptions(options), query: queryText },
        }));
      }
      return !prev;
    });
  }, [options, queryText, slots.A]);

  const handleSlotChange = useCallback(
    (slot: "A" | "B") => {
      if (slot === activeSlot) return;

      // Save current slot
      setSlots((prev) => ({
        ...prev,
        [activeSlot]: { ...prev[activeSlot], options: cloneOptions(options), query: queryText },
      }));

      // Load target slot
      setActiveSlot(slot);
      setOptions(cloneOptions(slots[slot].options));
      setQueryText(slots[slot].query);
      setActivePresetId(null);
    },
    [activeSlot, options, queryText, slots],
  );

  const handleMobileClose = useCallback(() => {
    setMobileResultOpen(false);
  }, []);

  // --- Keyboard shortcuts ---

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTextInput(e.target)) return;

      switch (e.key.toLowerCase()) {
        case "c":
          if (!e.ctrlKey && !e.metaKey) handleCompareToggle();
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6": {
          const idx = Number.parseInt(e.key, 10) - 1;
          const presetId = PRESET_ORDER[idx];
          if (presetId) handlePresetSelect(presetId);
          break;
        }
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleCompareToggle, handlePresetSelect]);

  // --- Mobile result dot class ---

  const mobileResultDotClass = useMemo(() => {
    if (!analysisResult) return "mobile-result-dot";
    if (analysisResult.violation || analysisResult.error) return "mobile-result-dot fail";
    return "mobile-result-dot safe";
  }, [analysisResult]);

  return (
    <>
      <Header compareActive={compareMode} onCompareToggle={handleCompareToggle} />

      <div className="playground-layout">
        {/* Left Panel: Options + Editor */}
        <aside className="left-panel">
          <section className="left-section">
            <div className="section-header">
              <span className="section-title">Configuration</span>
            </div>
            <OptionsPanel onChange={handleOptionsChange} options={options} />
          </section>

          <section className="left-section editor-section">
            <div className="section-header">
              <span className="section-title">Query</span>
              {compareMode && (
                <CompareTabs
                  activeSlot={activeSlot}
                  onSlotChange={handleSlotChange}
                  slots={slots}
                />
              )}
            </div>
            <PresetBar activePresetId={activePresetId} onSelect={handlePresetSelect} />
            <CodeEditor onChange={handleQueryChange} queryText={queryText} />
          </section>
        </aside>

        {/* Center: AST Tree Visualization */}
        <TreeView maxDepth={options.maxDepth} result={analysisResult} />

        {/* Right: Result Panel */}
        <ResultPanel
          onClose={handleMobileClose}
          open={mobileResultOpen}
          options={options}
          result={analysisResult}
        />
      </div>

      {/* Mobile Result Toggle */}
      <button
        aria-label="Show results"
        className="mobile-result-toggle"
        onClick={() => setMobileResultOpen((p) => !p)}
        type="button"
      >
        <span className={mobileResultDotClass} />
        <span>Results</span>
      </button>
    </>
  );
}
