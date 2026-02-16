/**
 * GraphQL Yoga example with graphql-query-depth-limit-esm.
 *
 * Run:
 *   pnpm build && npx tsx examples/servers/yoga-server.ts
 *
 * Then open http://localhost:4000/graphql in your browser to use GraphiQL.
 */

import { createServer } from "node:http";
import { createSchema, createYoga } from "graphql-yoga";
import { depthLimit } from "../../dist/index.js";
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

const server = createServer(yoga);
const PORT = 4000;

server.listen(PORT, () => {
	printBanner(`http://localhost:${PORT}/graphql`);
});
