/**
 * Welcome prompt — full-screen overlay shown on reload.
 *
 * Asks the user whether to watch the descent animation or skip
 * straight to the interactive playground. Includes an opt-out
 * checkbox to permanently disable the prompt.
 *
 * @module WelcomePrompt
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { disableIntro } from "../lib/utils";

interface WelcomePromptProps {
  onPlay: () => void;
  onSkip: () => void;
}

/** Full-screen welcome overlay with play/skip options. */
export function WelcomePrompt({ onPlay, onSkip }: WelcomePromptProps) {
  const [dontShow, setDontShow] = useState(false);
  const ctaRef = useRef<HTMLButtonElement>(null);

  const handlePlay = useCallback(() => {
    if (dontShow) disableIntro();
    onPlay();
  }, [dontShow, onPlay]);

  const handleSkip = useCallback(() => {
    if (dontShow) disableIntro();
    onSkip();
  }, [dontShow, onSkip]);

  /* Focus the CTA on mount; dismiss on Escape */
  useEffect(() => {
    ctaRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleSkip();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSkip]);

  return (
    <div
      aria-describedby="welcome-desc"
      aria-labelledby="welcome-heading"
      aria-modal="true"
      className="welcome"
      role="dialog"
    >
      <div className="welcome-content">
        <h1 className="welcome-title" id="welcome-heading">
          graphql-query-depth-limit-esm
        </h1>
        <p className="welcome-subtitle" id="welcome-desc">
          See how query depth is analyzed, field by field, with real-time AST visualization.
        </p>

        <button className="welcome-play" onClick={handlePlay} ref={ctaRef} type="button">
          Watch the descent{" "}
          <span aria-hidden="true" className="welcome-play-arrow">
            &rarr;
          </span>
        </button>

        <button className="welcome-skip" onClick={handleSkip} type="button">
          skip to playground
        </button>

        <label className="welcome-opt-out">
          <input
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            type="checkbox"
          />
          <span>Don&apos;t show again</span>
        </label>
      </div>
    </div>
  );
}
