# graphql-query-depth-limit-esm

[![npm version](https://img.shields.io/npm/v/graphql-query-depth-limit-esm.svg)](https://www.npmjs.com/package/graphql-query-depth-limit-esm)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/lafittemehdy/graphql-query-depth-limit-esm/actions/workflows/test.yml/badge.svg)](https://github.com/lafittemehdy/graphql-query-depth-limit-esm/actions)

Protect your GraphQL API by limiting query depth before execution.

Prevents deeply nested queries from overloading your server. A lightweight, zero-dependency library that works with any GraphQL server (Apollo, Yoga, etc.) with native ESM and TypeScript support.

## Features

- **Native ESM & TypeScript:** Modern module support with full type safety
- **Works Anywhere:** Compatible with any GraphQL-compliant server (Apollo, Yoga, etc.)
- **Fragment Support:** Correctly handles fragment spreads and inline fragments
- **Flexible Ignore Rules:** Skip specific fields using strings, RegExp, or custom functions
- **Directive Support:** Field-specific depth limits using `@depth` directive
- **Zero Dependencies:** Lightweight and focused (small bundle size)
- **Well Tested:** Comprehensive test suite

## Installation

```bash
npm install graphql-query-depth-limit-esm
```

## Quick Start

### Apollo Server Integration

```typescript
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { depthLimit } from 'graphql-query-depth-limit-esm';

// Step 1: Define your schema
const typeDefs = `#graphql
  directive @depth(max: Int!) on FIELD_DEFINITION

  type Query {
    # Regular user endpoint with depth limit of 3
    user(id: ID!): User @depth(max: 3)

    # Admin endpoint with higher depth limit
    adminUser(id: ID!): User @depth(max: 10)

    # Public endpoint without directive (uses global limit)
    users: [User!]!
  }

  type User {
    id: ID!
    name: String!
    email: String!
    friends: [User!]!
    posts: [Post!]!
  }

  type Post {
    id: ID!
    title: String!
    author: User!
  }
`;

// Step 2: Define your resolvers
const resolvers = {
  Query: {
    user: (_: unknown, { id }: { id: string }) => ({
      id,
      name: "John Doe",
      email: "john@example.com",
      friends: [],
      posts: [],
    }),
    adminUser: (_: unknown, { id }: { id: string }) => ({
      id,
      name: "Admin User",
      email: "admin@example.com",
      friends: [],
      posts: [],
    }),
    users: () => [
      {
        id: "1",
        name: "Alice",
        email: "alice@example.com",
        friends: [],
        posts: [],
      },
    ],
  },
  User: {
    friends: (parent: { id: string }) => [
      {
        id: `${parent.id}-friend`,
        name: "Friend User",
        email: "friend@example.com",
        friends: [],
        posts: [],
      },
    ],
    posts: () => [],
  },
};

// Step 3: Create and start the server with depth limiting
const server = new ApolloServer({
  typeDefs,
  resolvers,
  validationRules: [
    // Global depth limit of 5 with directive support enabled
    depthLimit(5, { useDirective: true }),
  ],
});

const { url } = await startStandaloneServer(server, {
  listen: { port: 4000 },
});

console.log(`🚀 Server ready at: ${url}`);
```

## How It Works

The library calculates query depth during GraphQL validation (before execution). Deeply nested queries are rejected before hitting your business logic.

**Process:**
1. Client sends a query
2. Server parses and validates the query
3. **Query depth calculation runs** (this library)
4. If validation passes, query executes

The library traverses the query AST to calculate depth. It correctly handles fragments and introspection fields, counting only fields that actually contribute to nesting.

---

## Usage Examples

### Basic Depth Limiting

```typescript
import { depthLimit } from 'graphql-query-depth-limit-esm';
import { ApolloServer } from '@apollo/server';

const server = new ApolloServer({
  schema,
  validationRules: [depthLimit(10)], // Maximum depth of 10
});
```

### With Ignore Rules

Skip specific fields from depth calculation:

```typescript
import { depthLimit } from 'graphql-query-depth-limit-esm';

const server = new ApolloServer({
  schema,
  validationRules: [
    depthLimit(10, {
      ignore: [
        'friends',              // Exact field name
        /^internal/,            // RegExp pattern
        (fieldName) => fieldName.startsWith('_'), // Custom function
      ],
    }),
  ],
});
```

### With Callback

Monitor query depths:

```typescript
import { depthLimit } from 'graphql-query-depth-limit-esm';

const server = new ApolloServer({
  schema,
  validationRules: [
    depthLimit(10, undefined, (depths) => {
      console.log('Query depths:', depths);
      // Output: { "GetUser": 5, "GetPosts": 3 }
    }),
  ],
});
```

### With @depth Directive

Apply field-specific depth limits using the `@depth` directive:

```typescript
import { depthLimit } from 'graphql-query-depth-limit-esm';

// First, add the directive to your schema
const typeDefs = `#graphql
  directive @depth(max: Int!) on FIELD_DEFINITION

  type Query {
    publicUser(id: ID!): User @depth(max: 2)
    adminUser(id: ID!): User @depth(max: 10)
  }

  type User {
    id: ID!
    name: String!
    friends: [User]
  }
`;

const server = new ApolloServer({
  typeDefs,
  resolvers,
  validationRules: [
    depthLimit(5, { useDirective: true }),
  ],
});
```

**How it works:**
- `publicUser` field has `@depth(max: 2)` - queries can only go 2 levels deep
- `adminUser` field has `@depth(max: 10)` - queries can go 10 levels deep
- Fields without `@depth` directive use the global limit (5 in this example)
- The `@depth` directive can be combined with `@complexity` and other directives

## How Depth is Calculated

Depth is measured by counting nested field selections:

```graphql
query {
  user {           # depth 1
    posts {        # depth 2
      comments {   # depth 3
        author {   # depth 4
          name     # depth 4 (scalar fields don't add depth)
        }
      }
    }
  }
}
# Total depth: 4
```

### What Doesn't Add Depth

- **Fragment spreads** (`...FragmentName`) - The fragment's fields are counted, not the spread itself
- **Inline fragments** (`... on Type { }`) - The inline fragment doesn't add depth
- **Introspection fields** (`__typename`, `__schema`, `__type`, etc.)
- **Fields matching ignore rules** - Skipped entirely from calculation
- **Scalar/leaf fields** - Terminal nodes don't increase depth

## Query Depth Examples

**Schema:**
```graphql
type Query {
  user(id: ID!): User
}

type User {
  id: ID!
  name: String!
  friends: [User]
  posts: [Post]
}

type Post {
  id: ID!
  title: String!
  comments: [Comment]
}

type Comment {
  id: ID!
  body: String!
  author: User
}
```

| Query | Depth | Allowed (max 3)? |
| :--- | :---: | :---: |
| `{ user { id } }` | 1 | ✅ |
| `{ user { friends { name } } }` | 2 | ✅ |
| `{ user { posts { comments { body } } } }` | 3 | ✅ |
| `{ user { posts { comments { author { name } } } } }` | 4 | ❌ |
| `{ user { friends { friends { friends { name } } } } }` | 4 | ❌ |

## Integration Examples

### Apollo Server

```typescript
import { ApolloServer } from '@apollo/server';
import { depthLimit } from 'graphql-query-depth-limit-esm';

const server = new ApolloServer({
  schema,
  validationRules: [depthLimit(10)],
});
```

### Express GraphQL

```typescript
import { graphqlHTTP } from 'express-graphql';
import { depthLimit } from 'graphql-query-depth-limit-esm';

app.use(
  '/graphql',
  graphqlHTTP({
    schema,
    validationRules: [depthLimit(10)],
  }),
);
```

### GraphQL Yoga

```typescript
import { createYoga } from 'graphql-yoga';
import { depthLimit } from 'graphql-query-depth-limit-esm';

const yoga = createYoga({
  schema,
  validationRules: [depthLimit(10)],
});
```

## API Reference

### `depthLimit(maxDepth, options?, callback?)`

Creates a GraphQL validation rule that limits query depth.

- `maxDepth` (number, **required**) - Maximum allowed depth for queries
- `options` (object, optional):
  - `caseInsensitiveIgnore` (boolean, optional) - Enable case-insensitive matching for string-based ignore rules. Default: `false`
  - `ignore` (IgnoreRule[], optional) - Fields to exclude from depth calculation
    - String: Exact field name match (case-sensitive by default)
    - RegExp: Pattern matching
    - Function: `(fieldName: string) => boolean` - Custom logic
  - `useDirective` (boolean, optional) - Enable reading depth limits from `@depth` directive on fields. Default: `false`
- `callback` (DepthCallback, optional) - Called after validation with depth information
  - Receives object mapping operation names to their depths

**Returns:** `ValidationRule` - GraphQL validation rule function

### Ignore Rules

Control which fields are excluded from depth calculation:

```typescript
import { depthLimit } from 'graphql-query-depth-limit-esm';

const server = new ApolloServer({
  schema,
  validationRules: [
    depthLimit(5, {
      ignore: [
        'friends',                              // String: exact match
        /^metadata/,                            // RegExp: pattern match
        (fieldName) => fieldName.includes('__'), // Function: custom logic
      ],
    }),
  ],
});
```

## Security Considerations

This library is designed to protect against denial-of-service (DoS) attacks via deeply nested queries. Recent updates have strengthened the implementation to handle edge cases correctly:

### Correctly Handled Scenarios

✅ **Fragments at Different Depths** - Fragments used multiple times at different nesting levels are calculated correctly. Each usage is evaluated independently to prevent depth limit bypass.

```graphql
fragment UserInfo on User {
  posts { title }  # Adds 2 levels
}

query {
  user {
    ...UserInfo          # Depth: 1 + 2 = 3
    friends {
      ...UserInfo        # Depth: 2 + 2 = 4 ✓ (calculated independently)
    }
  }
}
```

✅ **Circular Fragment Detection** - Circular fragment references are detected per-path to prevent infinite recursion while maintaining accurate depth calculation.

✅ **Introspection Fields** - All introspection fields (`__typename`, `__schema`, `__type`, etc.) are automatically excluded from depth calculation.

### Known Limitations

⚠️ **Variables in @depth Directive** - The `@depth` directive only supports integer literals. Variables are not supported because their values are not available during the validation phase.

```graphql
# ✅ Works
type Query {
  user: User @depth(max: 5)
}

# ❌ Not supported - will fall back to global depth limit
type Query {
  user: User @depth(max: $maxDepth)
}
```

⚠️ **Case-Sensitive Field Names** - By default, field name matching is case-sensitive (as per GraphQL specification). Use the `caseInsensitiveIgnore` option if you need case-insensitive matching for ignore rules.

```typescript
// Case-sensitive (default)
depthLimit(5, { ignore: ['friends'] })  // Only matches 'friends', not 'Friends'

// Case-insensitive
depthLimit(5, {
  caseInsensitiveIgnore: true,
  ignore: ['friends']  // Matches 'friends', 'Friends', 'FRIENDS', etc.
})
```

### Security Best Practices

1. **Always use depth limiting in production** - Even if you think your schema is safe
2. **Combine with complexity limiting** - Use both for comprehensive protection
3. **Set reasonable limits** - Balance security with legitimate use cases (typically 5-15)
4. **Monitor query depths** - Use the callback to log and alert on suspicious patterns
5. **Use field-specific limits** - Apply stricter limits to recursive fields via `@depth` directive

## Why Depth Limiting?

Deeply nested queries can cause:

- **Performance issues** - Exponential data fetching (N+1 problem amplified)
- **DoS attacks** - Server resource exhaustion
- **Database overload** - Too many nested joins

### Example Attack

```graphql
query Attack {
  user {
    friends {
      friends {
        friends {
          friends {
            # ... 100 levels deep
            # This could fetch millions of records!
          }
        }
      }
    }
  }
}
```

Without depth limiting, this query could:
- Fetch 10^100 user records (if each user has 10 friends)
- Exhaust server memory
- Crash your database

**Depth limiting stops this attack during validation.**

## Comparison with Complexity Limiting

| Feature | Depth Limit | Complexity Limit |
| :--- | :--- | :--- |
| **Measures** | Nesting level | Total operation cost |
| **Prevents** | Deep recursion attacks | Wide/expensive queries |
| **Example Attack** | `user { friends { friends { ... } } }` | `users(limit: 9999) { id name email ... }` |
| **Use Case** | Recursive relationships | Pagination/list queries |

**Best Practice:** Use **both** depth and complexity limiting for comprehensive protection.

---

## Requirements

- Node.js 18+
- GraphQL 16+

## Related Packages

- [graphql-query-complexity-esm](https://github.com/lafittemehdy/graphql-query-complexity-esm) - Query complexity limiting
- [graphql-rate-limit-redis-esm](https://github.com/lafittemehdy/graphql-rate-limit-redis-esm) - Rate limiting with Redis

## License

MIT License. This code is free to use. It has no opinions. You, I presume, do. Please use them.