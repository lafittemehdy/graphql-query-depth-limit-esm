# Security Policy

## Supported versions

Security fixes target the latest published release in the current major release line (3.x). Upgrade to the latest patch before reporting a suspected issue. Older release lines are unsupported.

## Private vulnerability reports

Use [GitHub private vulnerability reporting](https://github.com/lafittemehdy/graphql-query-depth-limit-esm/security/advisories/new), or email lafittemehdy@gmail.com if that channel is unavailable. Do not include exploits, credentials, personal data, or undisclosed vulnerability details in public issues.

Include affected versions, impact, prerequisites, a minimal safe reproduction, and any known workaround. Maintainers will coordinate investigation and disclosure; no fixed response time or security guarantee is promised.

## Deployment boundaries

Query validation supplements authentication, authorization, parser and request size limits, execution timeouts, and rate limiting. Cost estimates depend on the schema and estimator configuration; they cannot guarantee execution latency or memory use.
