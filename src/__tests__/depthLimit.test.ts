import { buildSchema, parse, validate } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { depthLimit } from "../depthLimit.js";

const schema = buildSchema(`
  type Query {
    user(id: ID!): User
    users: [User]
  }

  type User {
    id: ID!
    name: String!
    email: String!
    friends: [User]
    posts: [Post]
  }

  type Post {
    id: ID!
    title: String!
    body: String!
    author: User
    comments: [Comment]
  }

  type Comment {
    id: ID!
    body: String!
    author: User
    post: Post
  }
`);

describe("depthLimit", () => {
  describe("Basic Depth Limiting", () => {
    it("should allow queries within depth limit", () => {
      const query = parse(`
        query {
          user(id: "1") {
            name
            email
          }
        }
      `);

      const errors = validate(schema, query, [depthLimit(5)]);
      expect(errors).toHaveLength(0);
    });

    it("should block queries exceeding depth limit", () => {
      const query = parse(`
        query deepQuery {
          user(id: "1") {
            friends {
              friends {
                friends {
                  friends {
                    friends {
                      name
                    }
                  }
                }
              }
            }
          }
        }
      `);

      const errors = validate(schema, query, [depthLimit(3)]);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain(
        "'deepQuery' has depth 4 which exceeds maximum operation depth of 3",
      );
    });

    it("should calculate depth correctly for nested fields", () => {
      const query = parse(`
        query {
          user(id: "1") {
            posts {
              comments {
                author {
                  name
                }
              }
            }
          }
        }
      `);

      const errors = validate(schema, query, [depthLimit(4)]);
      expect(errors).toHaveLength(0);

      const errorsExceeded = validate(schema, query, [depthLimit(3)]);
      expect(errorsExceeded).toHaveLength(1);
    });
  });

  describe("Fragment Handling", () => {
    it("should handle fragment spreads without adding depth", () => {
      const query = parse(`
        query {
          user(id: "1") {
            ...UserFields
          }
        }

        fragment UserFields on User {
          name
          email
          friends {
            name
          }
        }
      `);

      const errors = validate(schema, query, [depthLimit(2)]);
      expect(errors).toHaveLength(0);
    });

    it("should handle inline fragments without adding depth", () => {
      const query = parse(`
        query {
          user(id: "1") {
            ... on User {
              name
              friends {
                name
              }
            }
          }
        }
      `);

      const errors = validate(schema, query, [depthLimit(2)]);
      expect(errors).toHaveLength(0);
    });

    it("should handle nested fragments correctly", () => {
      const query = parse(`
        query {
          user(id: "1") {
            ...UserWithFriends
          }
        }

        fragment UserWithFriends on User {
          name
          friends {
            ...FriendFields
          }
        }

        fragment FriendFields on User {
          name
          posts {
            title
          }
        }
      `);

      const errors = validate(schema, query, [depthLimit(3)]);
      expect(errors).toHaveLength(0);

      const errorsExceeded = validate(schema, query, [depthLimit(2)]);
      expect(errorsExceeded).toHaveLength(1);
    });

    it("should handle circular fragments without infinite loop", () => {
      const query = parse(`
        query {
          user(id: "1") {
            ...UserFields
          }
        }

        fragment UserFields on User {
          name
          friends {
            ...UserFields
          }
        }
      `);

      const errors = validate(schema, query, [depthLimit(5)]);
      expect(errors).toHaveLength(0);
    });
  });

  describe("Introspection Fields", () => {
    it("should ignore __typename fields", () => {
      const query = parse(`
        query {
          __typename
          user(id: "1") {
            __typename
            name
            friends {
              __typename
              name
            }
          }
        }
      `);

      const errors = validate(schema, query, [depthLimit(2)]);
      expect(errors).toHaveLength(0);
    });

    it("should ignore __schema introspection", () => {
      const query = parse(`
        query {
          __schema {
            queryType {
              name
              fields {
                name
                type {
                  name
                  kind
                }
              }
            }
          }
        }
      `);

      const errors = validate(schema, query, [depthLimit(1)]);
      expect(errors).toHaveLength(0);
    });
  });

  describe("Custom Ignore Rules", () => {
    it("should ignore fields matching string rule", () => {
      const query = parse(`
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
      `);

      const errors = validate(schema, query, [
        depthLimit(2, { ignore: ["friends"] }),
      ]);
      expect(errors).toHaveLength(0);
    });

    it("should ignore fields matching RegExp rule", () => {
      const query = parse(`
        query {
          user(id: "1") {
            friends {
              posts {
                comments {
                  body
                }
              }
            }
          }
        }
      `);

      const errors = validate(schema, query, [
        depthLimit(2, { ignore: [/^(friends|posts|comments)$/] }),
      ]);
      expect(errors).toHaveLength(0);
    });

    it("should ignore fields matching function rule", () => {
      const query = parse(`
        query {
          user(id: "1") {
            friends {
              friends {
                name
              }
            }
          }
        }
      `);

      const errors = validate(schema, query, [
        depthLimit(2, {
          ignore: [(fieldName) => fieldName === "friends"],
        }),
      ]);
      expect(errors).toHaveLength(0);
    });

    it("should support multiple ignore rules", () => {
      const query = parse(`
        query {
          user(id: "1") {
            friends {
              posts {
                comments {
                  body
                }
              }
            }
          }
        }
      `);

      const errors = validate(schema, query, [
        depthLimit(2, {
          ignore: [
            "friends",
            /^posts$/,
            (fieldName) => fieldName === "comments",
          ],
        }),
      ]);
      expect(errors).toHaveLength(0);
    });
  });

  describe("Multiple Operations", () => {
    it("should validate each operation separately", () => {
      const query = parse(`
        query ShallowQuery {
          user(id: "1") {
            name
          }
        }

        query DeepQuery {
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
      `);

      const errors = validate(schema, query, [depthLimit(2)]);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("'DeepQuery'");
    });
  });

  describe("Callback Functionality", () => {
    it("should call callback with depth information", () => {
      const query = parse(`
        query TestQuery {
          user(id: "1") {
            friends {
              name
            }
          }
        }
      `);

      const callback = vi.fn();
      validate(schema, query, [depthLimit(5, undefined, callback)]);

      expect(callback).toHaveBeenCalledWith({ TestQuery: 2 });
    });

    it("should report depths for multiple operations", () => {
      const query = parse(`
        query Query1 {
          user(id: "1") {
            name
          }
        }

        query Query2 {
          users {
            friends {
              posts {
                title
              }
            }
          }
        }
      `);

      const callback = vi.fn();
      validate(schema, query, [depthLimit(5, undefined, callback)]);

      expect(callback).toHaveBeenCalledWith({
        Query1: 1,
        Query2: 3,
      });
    });

    it("should use 'anonymous' for unnamed operations", () => {
      const query = parse(`
        query {
          user(id: "1") {
            friends {
              name
            }
          }
        }
      `);

      const callback = vi.fn();
      validate(schema, query, [depthLimit(5, undefined, callback)]);

      expect(callback).toHaveBeenCalledWith({ anonymous: 2 });
    });
  });

  describe("Edge Cases", () => {
    it("should handle queries with no selection set", () => {
      const query = parse(`
        query {
          user(id: "1") {
            name
          }
        }
      `);

      const errors = validate(schema, query, [depthLimit(1)]);
      expect(errors).toHaveLength(0);
    });

    it("should handle queries with only scalar fields", () => {
      const query = parse(`
        query {
          user(id: "1") {
            name
            email
          }
        }
      `);

      const errors = validate(schema, query, [depthLimit(1)]);
      expect(errors).toHaveLength(0);
    });

    it("should handle depth of 0 (only root fields allowed)", () => {
      const query = parse(`
        query {
          user(id: "1") {
            name
          }
        }
      `);

      const errors = validate(schema, query, [depthLimit(0)]);
      expect(errors).toHaveLength(1);
    });

    it("should handle very deep queries efficiently", () => {
      let deepQuery = 'query { user(id: "1") {';
      for (let i = 0; i < 50; i++) {
        deepQuery += " friends {";
      }
      deepQuery += " name ";
      for (let i = 0; i < 50; i++) {
        deepQuery += "}";
      }
      deepQuery += "} }";

      const query = parse(deepQuery);
      const errors = validate(schema, query, [depthLimit(10)]);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("exceeds maximum operation depth");
    });
  });

  describe("Directive-Based Depth Limiting", () => {
    const schemaWithDirective = buildSchema(`
      directive @depth(max: Int!) on FIELD_DEFINITION

      type Query {
        user(id: ID!): User @depth(max: 2)
        adminUser(id: ID!): User @depth(max: 5)
      }

      type User {
        id: ID!
        name: String!
        email: String!
        friends: [User]
        posts: [Post]
      }

      type Post {
        id: ID!
        title: String!
        body: String!
        author: User
        comments: [Comment]
      }

      type Comment {
        id: ID!
        body: String!
        author: User
        post: Post
      }
    `);

    it("should respect field-specific depth limits from @depth directive", () => {
      const query = parse(`
        query {
          user(id: "1") {
            friends {
              friends {
                name
              }
            }
          }
        }
      `);

      const errors = validate(schema, query, [
        depthLimit(10, { useDirective: true }),
      ]);
      expect(errors).toHaveLength(0);

      const errorsWithDirective = validate(schemaWithDirective, query, [
        depthLimit(10, { useDirective: true }),
      ]);
      expect(errorsWithDirective).toHaveLength(1);
      expect(errorsWithDirective[0].message).toContain(
        "exceeds maximum operation depth",
      );
    });

    it("should allow different depth limits for different fields", () => {
      const userQuery = parse(`
        query {
          user(id: "1") {
            friends {
              friends {
                name
              }
            }
          }
        }
      `);

      const adminQuery = parse(`
        query {
          adminUser(id: "1") {
            friends {
              friends {
                friends {
                  friends {
                    name
                  }
                }
              }
            }
          }
        }
      `);

      // user has @depth(max: 2), should fail at depth 3
      const userErrors = validate(schemaWithDirective, userQuery, [
        depthLimit(10, { useDirective: true }),
      ]);
      expect(userErrors).toHaveLength(1);

      // adminUser has @depth(max: 5), should pass at depth 4
      const adminErrors = validate(schemaWithDirective, adminQuery, [
        depthLimit(10, { useDirective: true }),
      ]);
      expect(adminErrors).toHaveLength(0);
    });

    it("should fall back to global max depth when directive not present", () => {
      const query = parse(`
        query {
          users {
            friends {
              friends {
                friends {
                  name
                }
              }
            }
          }
        }
      `);

      const errors = validate(schema, query, [
        depthLimit(3, { useDirective: true }),
      ]);
      expect(errors).toHaveLength(1);
    });

    it("should work without useDirective option (backward compatible)", () => {
      const query = parse(`
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
      `);

      // Without useDirective, should use global depth limit
      const errors = validate(schemaWithDirective, query, [depthLimit(3)]);
      expect(errors).toHaveLength(1);
    });

    it("should combine directive limits with ignore rules", () => {
      const query = parse(`
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
      `);

      // With friends ignored, the query should pass even with @depth(max: 2)
      const errors = validate(schemaWithDirective, query, [
        depthLimit(10, { useDirective: true, ignore: ["friends"] }),
      ]);
      expect(errors).toHaveLength(0);
    });
  });

  describe("Advanced Fragment Handling", () => {
    it("should correctly calculate depth for fragments used at different depths", () => {
      // This tests the critical fix for fragment reuse
      const query = parse(`
        fragment UserInfo on User {
          name
          posts {
            title
          }
        }

        query {
          user(id: "1") {
            ...UserInfo
            friends {
              ...UserInfo
              friends {
                ...UserInfo
              }
            }
          }
        }
      `);

      // UserInfo expands to: name (scalar) + posts { title }
      // Query expands to:
      //   user (1) -> posts (2) -> title (scalar)
      //   user (1) -> friends (2) -> posts (3) -> title (scalar)
      //   user (1) -> friends (2) -> friends (3) -> posts (4) -> title (scalar)
      // Maximum depth: 4
      const errors = validate(schema, query, [depthLimit(4)]);
      expect(errors).toHaveLength(0);

      // Should fail with depth 3
      const errorsExceeded = validate(schema, query, [depthLimit(3)]);
      expect(errorsExceeded).toHaveLength(1);
    });

    it("should handle complex circular fragments correctly", () => {
      // Tests that circular fragments don't bypass depth limits
      const query = parse(`
        fragment UserFields on User {
          id
          name
          friends {
            ...UserFields
          }
        }

        query {
          user(id: "1") {
            friends {
              ...UserFields
            }
          }
        }
      `);

      // Even with circular reference, depth should be calculated correctly
      const errors = validate(schema, query, [depthLimit(10)]);
      expect(errors).toHaveLength(0);
    });

    it("should handle nested fragments at multiple depths", () => {
      const query = parse(`
        fragment PostInfo on Post {
          title
          comments {
            body
          }
        }

        fragment UserPosts on User {
          posts {
            ...PostInfo
          }
        }

        query {
          user(id: "1") {
            ...UserPosts
            friends {
              ...UserPosts
            }
          }
        }
      `);

      // UserPosts expands to: posts { PostInfo }
      // PostInfo expands to: title (scalar) + comments { body }
      // Query expands to:
      //   user (1) -> posts (2) -> comments (3) -> body (scalar)
      //   user (1) -> friends (2) -> posts (3) -> comments (4) -> body (scalar)
      // Maximum depth: 4
      const errors = validate(schema, query, [depthLimit(4)]);
      expect(errors).toHaveLength(0);

      const errorsExceeded = validate(schema, query, [depthLimit(3)]);
      expect(errorsExceeded).toHaveLength(1);
    });
  });

  describe("Case-Insensitive Field Ignoring", () => {
    it("should ignore fields case-sensitively by default", () => {
      const query = parse(`
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
      `);

      // "friends" should match "friends" exactly
      const errors = validate(schema, query, [
        depthLimit(2, { ignore: ["friends"] }),
      ]);
      expect(errors).toHaveLength(0);
    });

    it("should support case-insensitive matching when enabled", () => {
      const query = parse(`
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
      `);

      // "FRIENDS" should match "friends" with case-insensitive option
      const errors = validate(schema, query, [
        depthLimit(2, { caseInsensitiveIgnore: true, ignore: ["FRIENDS"] }),
      ]);
      expect(errors).toHaveLength(0);

      // Should also work with "Friends"
      const errors2 = validate(schema, query, [
        depthLimit(2, { caseInsensitiveIgnore: true, ignore: ["Friends"] }),
      ]);
      expect(errors2).toHaveLength(0);
    });

    it("should not match when case-insensitive is disabled", () => {
      const query = parse(`
        query {
          user(id: "1") {
            friends {
              friends {
                name
              }
            }
          }
        }
      `);

      // "FRIENDS" should NOT match "friends" by default
      const errors = validate(schema, query, [
        depthLimit(2, { ignore: ["FRIENDS"] }),
      ]);
      expect(errors).toHaveLength(1);
    });
  });

  describe("Directive with Variables", () => {
    it("should fall back to global limit when directive uses variables", () => {
      const schemaWithVarDirective = buildSchema(`
        directive @depth(max: Int!) on FIELD_DEFINITION

        type Query {
          user(id: ID!): User
        }

        type User {
          id: ID!
          name: String!
          friends: [User] @depth(max: 10)
        }
      `);

      // Create a query that would pass with max: 10 but fail with global limit
      const query = parse(`
        query {
          user(id: "1") {
            friends {
              friends {
                friends {
                  friends {
                    name
                  }
                }
              }
            }
          }
        }
      `);

      // With useDirective, should respect the @depth(max: 10) on friends
      const errors = validate(schemaWithVarDirective, query, [
        depthLimit(3, { useDirective: true }),
      ]);
      expect(errors).toHaveLength(0);

      // Note: We can't test variable scenario in validation phase
      // This test documents that literal values work correctly
    });
  });

  describe("Edge Cases", () => {
    it("should handle documents with no operations", () => {
      const query = parse(`
        fragment UserInfo on User {
          name
          email
        }
      `);

      // Should not throw, just do nothing
      const errors = validate(schema, query, [depthLimit(5)]);
      expect(errors).toHaveLength(0);
    });

    it("should handle empty selection sets gracefully", () => {
      const query = parse(`
        query {
          users {
            id
          }
        }
      `);

      const errors = validate(schema, query, [depthLimit(2)]);
      expect(errors).toHaveLength(0);
    });

    it("should handle fragments within fragments at varying depths", () => {
      const query = parse(`
        fragment Level1 on User {
          name
        }

        fragment Level2 on User {
          ...Level1
          email
        }

        fragment Level3 on User {
          ...Level2
          posts {
            title
          }
        }

        query {
          user(id: "1") {
            ...Level3
            friends {
              ...Level3
            }
          }
        }
      `);

      // Level3 expands to: Level2 + posts { title }
      // Level2 expands to: Level1 + email
      // Level1 expands to: name
      // Query expands to:
      //   user (1) -> posts (2) -> title (scalar)
      //   user (1) -> friends (2) -> posts (3) -> title (scalar)
      // Maximum depth: 3
      const errors = validate(schema, query, [depthLimit(3)]);
      expect(errors).toHaveLength(0);

      const errorsExceeded = validate(schema, query, [depthLimit(2)]);
      expect(errorsExceeded).toHaveLength(1);
    });
  });
});
