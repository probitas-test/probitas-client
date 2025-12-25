/**
 * GraphQL client for [Probitas](https://github.com/probitas-test/probitas) scenario testing framework.
 *
 * This package provides a GraphQL client designed for integration testing of GraphQL APIs.
 *
 * ## Features
 *
 * - **Query & Mutation**: Full support for GraphQL operations
 * - **Variables Support**: Pass typed variables to queries and mutations
 * - **Duration Tracking**: Built-in timing for performance monitoring
 * - **Error Inspection**: Inspect GraphQL errors and their structure
 * - **Resource Management**: Implements `AsyncDisposable` for proper cleanup
 * - **Template Literals**: Re-exports `outdent` for clean multi-line queries
 *
 * ## Installation
 *
 * ```bash
 * deno add jsr:@probitas/client-graphql
 * ```
 *
 * ## Quick Start
 *
 * ```ts
 * import { createGraphqlClient, outdent } from "@probitas/client-graphql";
 *
 * const client = createGraphqlClient({ url: "http://localhost:4000/graphql" });
 *
 * // Query with variables
 * const res = await client.query(outdent`
 *   query GetUser($id: ID!) {
 *     user(id: $id) { id name email }
 *   }
 * `, { id: "123" });
 * console.log("User:", res.data);
 *
 * // Mutation
 * const created = await client.mutation(outdent`
 *   mutation CreateUser($input: CreateUserInput!) {
 *     createUser(input: $input) { id name }
 *   }
 * `, { input: { name: "Jane", email: "jane@example.com" } });
 * console.log("Created:", created.data);
 *
 * await client.close();
 * ```
 *
 * ## Using with `using` Statement
 *
 * ```ts
 * import { createGraphqlClient } from "@probitas/client-graphql";
 *
 * await using client = createGraphqlClient({ url: "http://localhost:4000/graphql" });
 *
 * const res = await client.query(`{ __typename }`);
 * console.log(res.data);
 * // Client automatically closed when block exits
 * ```
 *
 * ## Related Packages
 *
 * | Package | Description |
 * |---------|-------------|
 * | [`@probitas/client`](https://jsr.io/@probitas/client) | Core utilities and types |
 * | [`@probitas/client-http`](https://jsr.io/@probitas/client-http) | HTTP client |
 *
 * ## Links
 *
 * - [GitHub Repository](https://github.com/probitas-test/probitas-client)
 * - [Probitas Framework](https://github.com/probitas-test/probitas)
 *
 * @module
 */

export type * from "./types.ts";
export * from "./errors.ts";
export type * from "./response.ts";
export * from "./client.ts";
export { outdent } from "@cspotcode/outdent";
