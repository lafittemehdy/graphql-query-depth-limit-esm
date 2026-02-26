/**
 * A/B comparison slot tabs with colored status dots.
 *
 * @module CompareTabs
 */

import type { AnalysisResult } from "../types/analysis";

interface CompareTabsProps {
  activeSlot: "A" | "B";
  onSlotChange: (slot: "A" | "B") => void;
  slots: Record<"A" | "B", { result: AnalysisResult | null }>;
}

/** Compact tab row for switching between comparison slots. */
export function CompareTabs({ activeSlot, onSlotChange, slots }: CompareTabsProps) {
  return (
    <div className="slot-tabs visible">
      {(["A", "B"] as const).map((slotKey) => {
        const result = slots[slotKey].result;
        let dotClass = "slot-dot pending";
        if (result) {
          dotClass = result.violation ? "slot-dot fail" : "slot-dot safe";
        }

        return (
          <button
            className={`slot-tab${slotKey === activeSlot ? " active" : ""}`}
            key={slotKey}
            onClick={() => onSlotChange(slotKey)}
            type="button"
          >
            <span className={dotClass} />
            {slotKey}
          </button>
        );
      })}
    </div>
  );
}
