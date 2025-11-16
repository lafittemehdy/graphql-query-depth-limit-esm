import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { depthLimit } from "graphql-query-depth-limit-esm";

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

    # Posts endpoint
    posts: [Post!]!
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
    body: String!
    author: User!
    comments: [Comment!]!
  }

  type Comment {
    id: ID!
    body: String!
    author: User!
    post: Post!
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
      {
        id: "2",
        name: "Bob",
        email: "bob@example.com",
        friends: [],
        posts: [],
      },
    ],
    posts: () => [
      {
        id: "1",
        title: "Hello World",
        body: "This is my first post",
        author: {
          id: "1",
          name: "Alice",
          email: "alice@example.com",
          friends: [],
          posts: [],
        },
        comments: [],
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
  Post: {
    comments: () => [],
  },
  Comment: {
    author: () => ({
      id: "1",
      name: "Alice",
      email: "alice@example.com",
      friends: [],
      posts: [],
    }),
    post: () => ({
      id: "1",
      title: "Hello World",
      body: "This is my first post",
      author: {
        id: "1",
        name: "Alice",
        email: "alice@example.com",
        friends: [],
        posts: [],
      },
      comments: [],
    }),
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
console.log("\nDepth Limits:");
console.log("- user field: max depth 3 (via @depth directive)");
console.log("- adminUser field: max depth 10 (via @depth directive)");
console.log("- users/posts fields: max depth 5 (global limit)");
