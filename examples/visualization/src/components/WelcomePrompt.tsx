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
  const dialogRef = useRef<HTMLDialogElement>(null);

  const handlePlay = useCallback(() => {
    if (dontShow) disableIntro();
    onPlay();
  }, [dontShow, onPlay]);

  const handleSkip = useCallback(() => {
    if (dontShow) disableIntro();
    onSkip();
  }, [dontShow, onSkip]);

  // Native modality makes background controls inert and restores focus on close.
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    ctaRef.current?.focus();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      aria-describedby="welcome-desc"
      aria-labelledby="welcome-heading"
      className="welcome"
      onCancel={(event) => {
        event.preventDefault();
        handleSkip();
      }}
      ref={dialogRef}
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
    </dialog>
  );
}
