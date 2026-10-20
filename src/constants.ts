/**
 * Error extension codes for depth limit violations.
 */
export const ERROR_CODES = Object.freeze({
	IGNORE_RULE_ERROR: "IGNORE_RULE_ERROR",
	NODE_LIMIT_EXCEEDED: "NODE_LIMIT_EXCEEDED",
	QUERY_TOO_DEEP: "QUERY_TOO_DEEP",
} as const);
