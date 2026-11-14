/** Specifies visualization traversal bounds and clipboard failure behavior. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeQuery } from "../../examples/visualization/src/lib/analysis-engine.js";

import { copyToClipboard } from "../../examples/visualization/src/lib/utils.js";

afterEach(() => vi.unstubAllGlobals());

describe("visualization safety", () => {
	it("bounds repeated fragment expansion", () => {
		const fragments = ["fragment F0 on Query { name }"];
		for (let i = 1; i <= 20; i++)
			fragments.push(`fragment F${i} on Query { ...F${i - 1} ...F${i - 1} }`);
		const result = analyzeQuery(`{ ...F20 } ${fragments.join(" ")}`, {
			maxDepth: 5,
			ignore: [],
			ignoreIntrospection: "typename",
		});
		expect(result.error).toContain("node limit");
		expect(result.tree).toBeNull();
	});
});

describe("clipboard permissions", () => {
	it("reports success only after a fulfilled write", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		const success = vi.fn();
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		copyToClipboard("result", success);
		expect(success).not.toHaveBeenCalled();
		await Promise.resolve();
		expect(writeText).toHaveBeenCalledWith("result");
		expect(success).toHaveBeenCalledOnce();
	});
	it("handles a denied write without claiming success", async () => {
		const success = vi.fn();
		vi.stubGlobal("navigator", {
			clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
		});
		copyToClipboard("result", success);
		await Promise.resolve();
		expect(success).not.toHaveBeenCalled();
	});
	it("handles an unavailable clipboard without throwing", () => {
		vi.stubGlobal("navigator", {});
		expect(() => copyToClipboard("result", vi.fn())).not.toThrow();
	});
});
