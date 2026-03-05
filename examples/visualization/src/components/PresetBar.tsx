/**
 * Horizontal preset tab bar with inline active description.
 *
 * Pattern matches the complexity and rate-limit demos for
 * visual consistency across the graphql security suite.
 *
 * @module PresetBar
 */

import { useMemo } from "react";

import { PRESET_ORDER, PRESETS } from "../lib/presets";

interface PresetBarProps {
  activePresetId: string | null;
  onSelect: (presetId: string) => void;
}

/** Compact horizontal row of preset buttons with inline active description. */
export function PresetBar({ activePresetId, onSelect }: PresetBarProps) {
  const activeDescription = useMemo(
    () => PRESETS.find((p) => p.id === activePresetId)?.description ?? null,
    [activePresetId],
  );

  return (
    <div className="preset-bar">
      {PRESET_ORDER.map((id) => {
        const preset = PRESETS.find((p) => p.id === id);
        if (!preset) return null;
        return (
          <button
            aria-current={preset.id === activePresetId ? "true" : undefined}
            className={`preset-btn${preset.id === activePresetId ? " active" : ""}`}
            key={preset.id}
            onClick={() => onSelect(preset.id)}
            title={preset.description}
            type="button"
          >
            {preset.label}
          </button>
        );
      })}
      {activeDescription && (
        <output aria-live="polite" className="preset-description">
          {activeDescription}
        </output>
      )}
    </div>
  );
}
