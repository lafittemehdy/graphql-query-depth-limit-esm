import { ApolloServer } from "@apollo/server";
import { createSchema, createYoga } from "graphql-yoga";
import { describe, expect, it } from "vitest";
import { resolvers, typeDefs } from "../../examples/servers/schema.js";
import { depthLimit } from "../depth-limit.js";

const safe = '{ user(id: "1") { name } }';
const deep = '{ user(id: "1") { friends { friends { friends { friends { name } } } } } }';

describe("example server integrations", () => {
	it("executes safe queries and enforces directives through Apollo", async () => {
		const server = new ApolloServer({
			resolvers,
			typeDefs,
			validationRules: [depthLimit(7, { useDirective: true })],
		});
		try {
			const valid = await server.executeOperation({ query: safe });
			expect(valid.body.kind).toBe("single");
			if (valid.body.kind !== "single") throw new Error("Expected a single result");
			expect(valid.body.singleResult.data).toEqual({ user: { name: "Alice" } });
			const invalid = await server.executeOperation({ query: deep });
			expect(invalid.body.kind).toBe("single");
			if (invalid.body.kind !== "single") throw new Error("Expected a single result");
			expect(invalid.body.singleResult.errors?.[0]?.extensions).toMatchObject({
				depth: 5,
				maxDepth: 4,
			});
		} finally {
			await server.stop();
		}
	});

	it("starts Yoga with compatible dependencies and enforces directives", async () => {
		const yoga = createYoga({
			schema: createSchema({ resolvers, typeDefs }),
			plugins: [
				{
					onValidate({ addValidationRule }) {
						addValidationRule(depthLimit(7, { useDirective: true }));
					},
				},
			],
		});
		const request = (query: string) =>
			yoga.fetch("http://localhost/graphql", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/graphql-response+json",
				},
				body: JSON.stringify({ query }),
			});
		const valid = await request(safe);
		expect(await valid.json()).toMatchObject({ data: { user: { name: "Alice" } } });
		const invalid = await request(deep);
		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toMatchObject({
			errors: [{ extensions: { depth: 5, maxDepth: 4 } }],
		});
	});
});
