# Apollo Server Example (TypeScript)

This example demonstrates how to integrate `graphql-query-depth-limit-esm` with Apollo Server using TypeScript.

## Setup

```bash
pnpm install
```

## Build

```bash
pnpm run build
```

## Run

```bash
pnpm start
```

Or build and run in one command:

```bash
pnpm run dev
```

The server will start at [http://localhost:4000](http://localhost:4000)

## Test Queries

### Simple Query (Depth 2)

```graphql
query {
  user(id: "1") {
    name
    friends {
      name
    }
  }
}
```

**Depth:** 2 - **Passes** (under limit of 3 for user field)

### Deep Nesting Query (Should Fail)

```graphql
query {
  user(id: "1") {
    friends {
      friends {
        friends {
          name
        }
      }
    }
  }
}
```

**Depth:** 4 - **Exceeds limit of 3**

This query will be rejected with error:
```json
{
  "errors": [
    {
      "message": "'anonymous' exceeds maximum operation depth of 3"
    }
  ]
}
```
