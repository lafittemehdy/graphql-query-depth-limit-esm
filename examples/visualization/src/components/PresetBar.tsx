/**
 * Horizontal row of preset query buttons.
 *
 * @module PresetBar
 */

import { PRESET_ORDER, PRESETS } from "../lib/presets";

interface PresetBarProps {
  activePresetId: string | null;
  onSelect: (presetId: string) => void;
}

/** Compact grid of preset buttons. */
export function PresetBar({ activePresetId, onSelect }: PresetBarProps) {
  return (
    <div className="preset-row">
      {PRESET_ORDER.map((id) => {
        const preset = PRESETS.find((p) => p.id === id);
        if (!preset) return null;
        return (
          <button
            className={`preset-btn${preset.id === activePresetId ? " active" : ""}`}
            key={preset.id}
            onClick={() => onSelect(preset.id)}
            type="button"
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
