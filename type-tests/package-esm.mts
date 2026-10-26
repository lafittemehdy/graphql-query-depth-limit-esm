import {
	type DepthCallback,
	type DepthLimitOptions,
	depthLimit,
	ERROR_CODES,
} from "graphql-query-depth-limit-esm";

const rule = depthLimit(5);
void rule;

const options: DepthLimitOptions = { maxNodes: 100, useDirective: true };
const callback: DepthCallback = (depths) => {
	const depth: number | undefined = depths.Q;
	void depth;
};
depthLimit(5, options, callback);
const code: "NODE_LIMIT_EXCEEDED" = ERROR_CODES.NODE_LIMIT_EXCEEDED;
void code;
