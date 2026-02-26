/**
 * Shared schema, mock data, and resolvers for the example servers.
 *
 * Used by both `apollo-server.ts` and `yoga-server.ts`.
 */

import { depthDirectiveTypeDefs } from "../../src/index.js";

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export const typeDefs = `
	${depthDirectiveTypeDefs}

	type Query {
		post(id: ID!): Post
		user(id: ID!): User
	}

	type Comment {
		author: User!
		id: ID!
		replies: [Comment!]! @depth(max: 4)
		text: String!
	}

	type Post {
		author: User!
		comments: [Comment!]! @depth(max: 5)
		id: ID!
		title: String!
	}

	type User {
		email: String!
		friends: [User!]! @depth(max: 3)
		id: ID!
		name: String!
		posts: [Post!]!
	}
`;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface CommentData {
	authorId: string;
	id: string;
	replyIds: string[];
	text: string;
}

interface PostData {
	authorId: string;
	commentIds: string[];
	id: string;
	title: string;
}

interface UserData {
	email: string;
	friendIds: string[];
	id: string;
	name: string;
	postIds: string[];
}

const comments: Record<string, CommentData> = {
	"1": { authorId: "2", id: "1", replyIds: ["2"], text: "Great post! Really helpful." },
	"2": { authorId: "1", id: "2", replyIds: ["3"], text: "Thanks! Glad you liked it." },
	"3": { authorId: "3", id: "3", replyIds: ["4"], text: "I have a follow-up question." },
	"4": { authorId: "1", id: "4", replyIds: ["5"], text: "Sure, go ahead!" },
	"5": { authorId: "3", id: "5", replyIds: [], text: "Never mind, figured it out." },
};

const posts: Record<string, PostData> = {
	"1": { authorId: "1", commentIds: ["1"], id: "1", title: "Getting Started with GraphQL" },
	"2": { authorId: "2", commentIds: [], id: "2", title: "Depth Limiting Best Practices" },
};

const users: Record<string, UserData> = {
	"1": {
		email: "alice@example.com",
		friendIds: ["2", "3"],
		id: "1",
		name: "Alice",
		postIds: ["1"],
	},
	"2": { email: "bob@example.com", friendIds: ["1", "3"], id: "2", name: "Bob", postIds: ["2"] },
	"3": { email: "charlie@example.com", friendIds: ["1"], id: "3", name: "Charlie", postIds: [] },
};

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

export const resolvers = {
	Comment: {
		author: (parent: CommentData) => users[parent.authorId],
		replies: (parent: CommentData) => parent.replyIds.map((id) => comments[id]),
	},
	Post: {
		author: (parent: PostData) => users[parent.authorId],
		comments: (parent: PostData) => parent.commentIds.map((id) => comments[id]),
	},
	Query: {
		post: (_: unknown, { id }: { id: string }) => posts[id],
		user: (_: unknown, { id }: { id: string }) => users[id],
	},
	User: {
		friends: (parent: UserData) => parent.friendIds.map((id) => users[id]),
		posts: (parent: UserData) => parent.postIds.map((id) => posts[id]),
	},
};

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

/** Prints server configuration summary and example queries to the console. */
export function printBanner(port: number): void {
	console.log(`
┌─────────────────────────────────────────────┐
│  graphql-query-depth-limit-esm  —  Example  │
├─────────────────────────────────────────────┤
│  Server:   http://localhost:${port}/graphql    │
│  Max:      7 depth                          │
│  Engine:   iterative (stack-based DFS)      │
└─────────────────────────────────────────────┘

Try these queries:

  # Within limits (depth 3)
  query Safe {
    user(id: "1") {
      name
      posts {
        title
        comments { text }
      }
    }
  }

  # Exceeds @depth(max: 3) on friends
  query TooDeep {
    user(id: "1") {
      friends {
        friends {
          friends {
            friends { name }
          }
        }
      }
    }
  }

  # Nested replies (tests Comment.replies @depth(max: 4))
  query DeepReplies {
    post(id: "1") {
      comments {
        text
        replies {
          text
          replies {
            text
            replies { text }
          }
        }
      }
    }
  }
`);
}
