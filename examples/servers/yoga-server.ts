/**
 * GraphQL Yoga example with graphql-query-depth-limit-esm.
 *
 * Run:  pnpm example:yoga
 */

import { createServer } from "node:http";
import { createSchema, createYoga } from "graphql-yoga";
import { depthLimit } from "../../src/index.js";
import { printBanner, resolvers, typeDefs } from "./schema.js";

const yoga = createYoga({
	plugins: [
		{
			onValidate({ addValidationRule }) {
				addValidationRule(
					depthLimit(7, { useDirective: true }, (depths) => {
						console.log("[depth]", depths);
					}),
				);
			},
		},
	],
	schema: createSchema({ resolvers, typeDefs }),
});

const PORT = 4000;
const server = createServer(yoga);
server.listen(PORT, () => {
	printBanner(PORT);
	console.log("GraphQL Yoga ready");
});
