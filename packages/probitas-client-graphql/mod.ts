/**
 * @probitas/client-graphql - GraphQL client for Probitas scenario testing framework.
 *
 * @example
 * ```ts
 * import {
 *   createGraphqlClient,
 *   expectGraphqlResponse,
 *   outdent,
 * } from "@probitas/client-graphql";
 *
 * const client = createGraphqlClient({ endpoint: "http://localhost:4000/graphql" });
 *
 * const res = await client.query(outdent`
 *   query GetUser($id: ID!) {
 *     user(id: $id) { id name email }
 *   }
 * `, { id: "123" });
 *
 * expectGraphqlResponse(res)
 *   .ok()
 *   .dataContains({ user: { id: "123" } })
 *   .durationLessThan(1000);
 *
 * await client.close();
 * ```
 *
 * @module
 */

export type * from "./types.ts";
export * from "./errors.ts";
export { createGraphqlClient } from "./client.ts";
export * from "./response.ts";
export * from "./expect.ts";
export { outdent } from "@cspotcode/outdent";
