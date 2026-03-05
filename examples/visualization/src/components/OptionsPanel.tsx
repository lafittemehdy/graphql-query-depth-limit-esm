/**
 * Configuration panel — maxDepth, introspection, ignore rules, recursion guard.
 *
 * Contains inline sub-components: Stepper, SegmentToggle, ToggleSwitch, IgnoreRules.
 *
 * @module OptionsPanel
 */

import { type KeyboardEvent, useCallback, useEffect, useState } from "react";

import type { DepthOptions } from "../types/analysis";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OptionsPanelProps {
  onChange: (options: DepthOptions) => void;
  options: DepthOptions;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** Full options panel with all configurable controls. */
export function OptionsPanel({ onChange, options }: OptionsPanelProps) {
  const update = useCallback(
    (patch: Partial<DepthOptions>) => onChange({ ...options, ...patch }),
    [onChange, options],
  );

  return (
    <div className="options-content">
      {/* Max Depth */}
      <OptionGroup label="Max Depth">
        <Stepper
          max={100}
          min={0}
          onChange={(val) => update({ maxDepth: val })}
          value={options.maxDepth}
        />
      </OptionGroup>

      {/* Introspection */}
      <OptionGroup label="Introspection">
        <SegmentToggle
          onChange={(val) =>
            update({ ignoreIntrospection: val as DepthOptions["ignoreIntrospection"] })
          }
          segments={["all", "typename", "none"]}
          value={options.ignoreIntrospection}
        />
      </OptionGroup>

      {/* Ignore Mode (visible only when ignore rules exist) */}
      {options.ignore.length > 0 && (
        <OptionGroup label="Ignore Mode">
          <SegmentToggle
            onChange={(val) => update({ ignoreMode: val as "exclude" | "skip" })}
            segments={["exclude", "skip"]}
            value={options.ignoreMode ?? "exclude"}
          />
        </OptionGroup>
      )}

      {/* Case-Insensitive Ignore (visible only when ignore rules exist) */}
      {options.ignore.length > 0 && (
        <OptionGroup label="Case Insensitive">
          <ToggleSwitch
            checked={options.caseInsensitiveIgnore ?? false}
            onChange={(val) => update({ caseInsensitiveIgnore: val })}
          />
        </OptionGroup>
      )}

      {/* Recursion Guard (visible when ignore rules exist and mode is exclude) */}
      {options.ignore.length > 0 && (options.ignoreMode ?? "exclude") === "exclude" && (
        <OptionGroup label="Recursion Guard">
          <ToggleSwitch
            checked={options.limitIgnoredRecursion ?? false}
            onChange={(val) => update({ limitIgnoredRecursion: val })}
          />
        </OptionGroup>
      )}

      {/* Ignore Rules */}
      <IgnoreRules onChange={(rules) => update({ ignore: rules })} rules={options.ignore} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// OptionGroup — labeled row
// ---------------------------------------------------------------------------

function OptionGroup({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="option-group">
      <span className="option-label">{label}</span>
      <div className="option-control">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stepper — numeric ± control
// ---------------------------------------------------------------------------

interface StepperProps {
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}

function Stepper({ max, min, onChange, value }: StepperProps) {
  const [inputValue, setInputValue] = useState(String(value));

  /* Sync internal state when value changes externally (e.g. preset switch). */
  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const handleDecrement = useCallback(() => {
    const next = Math.max(min, value - 1);
    setInputValue(String(next));
    onChange(next);
  }, [min, onChange, value]);

  const handleIncrement = useCallback(() => {
    const next = Math.min(max, value + 1);
    setInputValue(String(next));
    onChange(next);
  }, [max, onChange, value]);

  const handleInput = useCallback(
    (raw: string) => {
      setInputValue(raw);
      if (!/^-?\d+$/.test(raw.trim())) return;
      const parsed = Number.parseInt(raw, 10);
      const clamped = Math.min(max, Math.max(min, parsed));
      onChange(clamped);
    },
    [max, min, onChange],
  );

  const handleBlur = useCallback(() => {
    const parsed = Number.parseInt(inputValue, 10);
    if (Number.isNaN(parsed)) {
      setInputValue(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    setInputValue(String(clamped));
    onChange(clamped);
  }, [inputValue, max, min, onChange, value]);

  return (
    <div className="deck-stepper">
      <button aria-label="Decrease" onClick={handleDecrement} type="button">
        &#x2212;
      </button>
      <input
        aria-label="Max depth value"
        max={max}
        min={min}
        onBlur={handleBlur}
        onChange={(e) => handleInput(e.target.value)}
        type="number"
        value={inputValue}
      />
      <button aria-label="Increase" onClick={handleIncrement} type="button">
        +
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SegmentToggle — multi-option button group
// ---------------------------------------------------------------------------

interface SegmentToggleProps {
  onChange: (value: string) => void;
  segments: string[];
  value: string;
}

function SegmentToggle({ onChange, segments, value }: SegmentToggleProps) {
  return (
    <div className="segment-toggle">
      {segments.map((seg) => (
        <button
          aria-pressed={seg === value}
          className={`segment-btn${seg === value ? " active" : ""}`}
          key={seg}
          onClick={() => onChange(seg)}
          type="button"
        >
          {seg}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToggleSwitch — boolean switch
// ---------------------------------------------------------------------------

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
}

function ToggleSwitch({ checked, onChange }: ToggleSwitchProps) {
  return (
    <button
      aria-checked={checked}
      className={`toggle-switch${checked ? " active" : ""}`}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    />
  );
}

// ---------------------------------------------------------------------------
// IgnoreRules — text input + add button + removable chips
// ---------------------------------------------------------------------------

interface IgnoreRulesProps {
  onChange: (rules: string[]) => void;
  rules: string[];
}

function IgnoreRules({ onChange, rules }: IgnoreRulesProps) {
  const [input, setInput] = useState("");

  const addRule = useCallback(() => {
    const val = input.trim();
    if (!val || rules.includes(val)) return;
    onChange([...rules, val]);
    setInput("");
  }, [input, onChange, rules]);

  const removeRule = useCallback(
    (rule: string) => onChange(rules.filter((r) => r !== rule)),
    [onChange, rules],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addRule();
      }
    },
    [addRule],
  );

  return (
    <div className="option-group ignore-rules-group">
      <div className="ignore-rules-top">
        <span className="option-label">Ignore Rules</span>
        <div className="ignore-input-row">
          <input
            aria-label="Add ignore rule"
            className="ignore-input"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Field name..."
            type="text"
            value={input}
          />
          <button
            aria-label="Add ignore rule"
            className="ignore-add-btn"
            onClick={addRule}
            type="button"
          >
            +
          </button>
        </div>
      </div>
      {rules.length > 0 && (
        <div className="ignore-chips">
          {rules.map((rule) => (
            <span className="ignore-chip" key={rule}>
              <span>{rule}</span>
              <button
                aria-label={`Remove rule: ${rule}`}
                className="ignore-chip-remove"
                onClick={() => removeRule(rule)}
                type="button"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
