/**
 * Apollo Server example with graphql-query-depth-limit-esm.
 *
 * Run:
 *   pnpm build && npx tsx examples/servers/apollo-server.ts
 *
 * Then open the printed URL in your browser to use Apollo Sandbox.
 */

import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { depthLimit } from "../../dist/index.js";
import { printBanner, resolvers, typeDefs } from "./schema.js";

const server = new ApolloServer({
	resolvers,
	typeDefs,
	validationRules: [
		depthLimit(7, { useDirective: true }, (depths) => {
			console.log("[depth]", depths);
		}),
	],
});

const { url } = await startStandaloneServer(server, { listen: { port: 4000 } });

printBanner(url);
