/**
 * Root application component — all state lives here.
 *
 * Layout: Header → (OptionsPanel + PresetBar + CodeEditor) | TreeView | ResultPanel
 *
 * First-visit animation ("The Descent") plays directly in the live UI:
 * tree levels are dimmed, then light up one by one from top to bottom
 * as the depth gauge fills, exceeded nodes glow red, then a beat
 * of silence before the BLOCKED verdict shakes in.
 *
 * @module App
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CodeEditor } from "./components/CodeEditor";
import { Header } from "./components/Header";
import { OptionsPanel } from "./components/OptionsPanel";
import { PresetBar } from "./components/PresetBar";
import { ResultPanel } from "./components/ResultPanel";
import { TreeView } from "./components/TreeView";
import { WelcomePrompt } from "./components/WelcomePrompt";
import { useAnalysis } from "./hooks/useAnalysis";
import { DEFAULT_PRESET_ID, PRESET_ORDER, PRESETS } from "./lib/presets";
import { isIntroDisabled, isTextInput } from "./lib/utils";
import type { DepthOptions } from "./types/analysis";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const ATTACK_PRESET = PRESETS.find((p) => p.id === "attack")!;
const DEFAULT_PRESET = PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!;

const REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function cloneOptions(opts: DepthOptions): DepthOptions {
  return { ...opts, ignore: [...opts.ignore] };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

/** Root application component. */
export function App() {
  // --- Core state ---
  const [activePresetId, setActivePresetId] = useState<string | null>(DEFAULT_PRESET_ID);
  const [mobileResultOpen, setMobileResultOpen] = useState(false);
  const [options, setOptions] = useState<DepthOptions>(cloneOptions(DEFAULT_PRESET.options));
  const [queryText, setQueryText] = useState(DEFAULT_PRESET.query);
  const [showWelcome, setShowWelcome] = useState(!isIntroDisabled());

  // --- Animation state ---
  const [badgeVisible, setBadgeVisible] = useState(true);
  const [depthOverride, setDepthOverride] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [revealDepth, setRevealDepth] = useState<number | null>(null);
  const [shaking, setShaking] = useState(false);

  const animCancelsRef = useRef<(() => void)[]>([]);
  const skippedRef = useRef(false);

  // --- Analysis ---
  const analysisResult = useAnalysis(queryText, options);

  // --- Finish / skip helpers ---

  const finishAnimation = useCallback(() => {
    for (const cancel of animCancelsRef.current) cancel();
    animCancelsRef.current = [];

    setBadgeVisible(true);
    setDepthOverride(null);
    setIsAnimating(false);
    setRevealDepth(null);
    setShaking(false);
  }, []);

  const skipAnimation = useCallback(() => {
    if (!isAnimating || skippedRef.current) return;
    skippedRef.current = true;
    finishAnimation();
  }, [isAnimating, finishAnimation]);

  // --- The Descent: animation sequence ---

  useEffect(() => {
    if (!isAnimating) return;
    skippedRef.current = false;

    const cancels: (() => void)[] = [];
    animCancelsRef.current = cancels;

    /** Schedule a callback after `ms` (cancellable). */
    function after(ms: number, fn: () => void): void {
      const t = setTimeout(() => {
        if (!skippedRef.current) fn();
      }, ms);
      cancels.push(() => clearTimeout(t));
    }

    // Reduced motion: show final state instantly
    if (REDUCED_MOTION) {
      after(300, finishAnimation);
      return;
    }

    // Wait for analysis result before animating
    if (!analysisResult?.tree) return;

    // Compute max depth in the tree for reveal steps
    const maxTreeDepth = analysisResult.depth;

    // Phase 0: Cold Open — everything dimmed, gauge at 0
    setRevealDepth(-1);
    setDepthOverride(0);
    setBadgeVisible(false);

    let elapsed = 500; // 500ms of stillness

    // Phase 1: The Descent — reveal tree levels one by one
    for (let level = 0; level <= maxTreeDepth; level++) {
      const levelTime = elapsed;
      after(levelTime, () => {
        setRevealDepth(level);
        setDepthOverride(Math.min(level, maxTreeDepth));
      });
      elapsed += 350;
    }

    // Phase 2: The Silence — full tree visible, gauge holds
    after(elapsed, () => {
      setRevealDepth(null);
    });
    elapsed += 600;

    // Phase 3: The Verdict — BLOCKED + shake
    after(elapsed, () => {
      setBadgeVisible(true);
      setDepthOverride(null);
      setShaking(true);
    });
    elapsed += 300;

    after(elapsed, () => {
      setShaking(false);
    });
    elapsed += 400;

    // Phase 4: Done — transition to playground
    after(elapsed, finishAnimation);

    return () => {
      for (const c of cancels) c();
    };
  }, [isAnimating, analysisResult, finishAnimation]);

  // --- Skip animation on any click or keypress ---

  useEffect(() => {
    if (!isAnimating) return;

    const handler = () => skipAnimation();

    // Small delay so the initial click/key doesn't immediately skip
    const t = setTimeout(() => {
      document.addEventListener("click", handler);
      document.addEventListener("keydown", handler);
    }, 200);

    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handler);
      document.removeEventListener("keydown", handler);
    };
  }, [isAnimating, skipAnimation]);

  // --- Welcome prompt handlers ---

  /** Load the attack preset and start the intro animation. */
  const startAnimation = useCallback(() => {
    setActivePresetId("attack");
    setOptions(cloneOptions(ATTACK_PRESET.options));
    setQueryText(ATTACK_PRESET.query);
    setBadgeVisible(false);
    setDepthOverride(0);
    setIsAnimating(true);
    setRevealDepth(-1);
    setShaking(false);
  }, []);

  const handleWelcomePlay = useCallback(() => {
    setShowWelcome(false);
    startAnimation();
  }, [startAnimation]);

  const handleWelcomeSkip = useCallback(() => {
    setShowWelcome(false);
  }, []);

  const handleReplay = useCallback(() => {
    if (isAnimating) return;
    startAnimation();
  }, [isAnimating, startAnimation]);

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

  const handleMobileClose = useCallback(() => {
    setMobileResultOpen(false);
  }, []);

  // --- Keyboard shortcuts ---

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTextInput(e.target)) return;

      switch (e.key.toLowerCase()) {
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
  }, [handlePresetSelect]);

  // --- Mobile result dot class ---

  const mobileResultDotClass = useMemo(() => {
    if (!analysisResult) return "mobile-result-dot";
    if (analysisResult.violation || analysisResult.error) return "mobile-result-dot fail";
    return "mobile-result-dot safe";
  }, [analysisResult]);

  return (
    <>
      {showWelcome && <WelcomePrompt onPlay={handleWelcomePlay} onSkip={handleWelcomeSkip} />}
      <Header onReplay={handleReplay} />

      <div className={`playground-layout${isAnimating ? " animating" : ""}`}>
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
            </div>
            <PresetBar activePresetId={activePresetId} onSelect={handlePresetSelect} />
            <CodeEditor onChange={handleQueryChange} queryText={queryText} />
          </section>
        </aside>

        {/* Center: AST Tree Visualization */}
        <TreeView
          maxDepth={options.maxDepth}
          result={analysisResult}
          revealDepth={isAnimating ? revealDepth : undefined}
        />

        {/* Right: Result Panel */}
        <ResultPanel
          badgeVisible={badgeVisible}
          depthOverride={isAnimating ? depthOverride : undefined}
          onClose={handleMobileClose}
          open={mobileResultOpen}
          options={options}
          result={analysisResult}
          shaking={shaking}
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
