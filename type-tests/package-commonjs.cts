import packageApi = require("graphql-query-depth-limit-esm");

const rule = packageApi.depthLimit(5);
void rule;

const options: packageApi.DepthLimitOptions = { maxNodes: 100, useDirective: true };
const callback: packageApi.DepthCallback = (depths) => {
	const depth: number | undefined = depths.Q;
	void depth;
};
packageApi.depthLimit(5, options, callback);
const code: "NODE_LIMIT_EXCEEDED" = packageApi.ERROR_CODES.NODE_LIMIT_EXCEEDED;
void code;
