import { describe, expect, it } from "vitest";
import { analyzeQuery } from "../../examples/visualization/src/lib/analysis-engine.js";

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
