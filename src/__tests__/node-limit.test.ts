import { buildSchema, parse, validate } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { depthLimit } from "../depth-limit.js";

const schema = buildSchema("type Query { name: String }");

describe("expanded node limit", () => {
	it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
		"rejects invalid maxNodes %s",
		(maxNodes) => expect(() => depthLimit(5, { maxNodes })).toThrow("Invalid maxNodes"),
	);

	it("accepts the exact node budget and rejects the next node", () => {
		const document = parse("{ a: name b: name }");
		expect(validate(schema, document, [depthLimit(0, { maxNodes: 2 })])).toEqual([]);
		const errors = validate(schema, document, [depthLimit(0, { maxNodes: 1 })]);
		expect(errors[0]?.extensions).toMatchObject({
			code: "NODE_LIMIT_EXCEEDED",
			maxNodes: 1,
			nodeCount: 2,
		});
	});

	it("bounds exponential fragment expansion in shallow queries with callbacks", () => {
		const fragments = ["fragment F0 on Query { name }"];
		for (let i = 1; i <= 20; i++) {
			fragments.push(`fragment F${i} on Query { ...F${i - 1} ...F${i - 1} }`);
		}
		const callback = vi.fn();
		const errors = validate(schema, parse(`{ ...F20 } ${fragments.join(" ")}`), [
			depthLimit(1, {}, callback),
		]);
		expect(errors[0]?.extensions).toMatchObject({ code: "NODE_LIMIT_EXCEEDED", maxNodes: 10_000 });
		expect(callback).toHaveBeenCalledWith({});
	});
});
