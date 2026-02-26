/**
 * Apollo Server example with graphql-query-depth-limit-esm.
 *
 * Run:  pnpm example:apollo
 */

import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { depthLimit } from "../../src/index.js";
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

const PORT = 4000;
const { url } = await startStandaloneServer(server, { listen: { port: PORT } });
printBanner(PORT);
console.log(`Apollo Server ready at ${url}`);
