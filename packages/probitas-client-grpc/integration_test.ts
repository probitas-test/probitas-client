/**
 * Integration tests for GrpcClient.
 *
 * Run with:
 *   docker compose up -d grpc-greeter
 *   deno test -A packages/probitas-client-grpc/integration_test.ts
 *   docker compose down
 */

import { assertEquals } from "@std/assert";
import { createGrpcClient } from "./client.ts";
import { expectGrpcResponse } from "./expect.ts";

const GRPC_ADDRESS = Deno.env.get("GRPC_ADDRESS") ?? "localhost:50051";
const PROTO_PATH = new URL("./testdata/helloworld.proto", import.meta.url)
  .pathname;

async function isGrpcServerAvailable(): Promise<boolean> {
  try {
    const [host, portStr] = GRPC_ADDRESS.split(":");
    const port = parseInt(portStr, 10);
    const conn = await Deno.connect({
      hostname: host,
      port,
    });
    conn.close();
    return true;
  } catch {
    return false;
  }
}

Deno.test({
  name: "Integration: gRPC",
  ignore: !(await isGrpcServerAvailable()),
  // grpc-js DNS resolver cannot cancel in-flight DNS requests on close().
  // This is a known limitation: https://github.com/denoland/deno/issues/28307
  sanitizeOps: false,
  async fn(t) {
    await t.step("unary call - SayHello", async () => {
      const client = await createGrpcClient({
        address: GRPC_ADDRESS,
        schema: PROTO_PATH,
      });

      try {
        const response = await client.call("helloworld.Greeter/SayHello", {
          name: "Probitas",
        });

        expectGrpcResponse(response)
          .ok()
          .hasContent();

        const data = response.json<{ message: string }>();
        // Server returns "Hello, {name}!" format
        assertEquals(data?.message, "Hello, Probitas!");
      } finally {
        await client.close();
      }
    });

    await t.step("unary call with metadata", async () => {
      const client = await createGrpcClient({
        address: GRPC_ADDRESS,
        schema: PROTO_PATH,
        metadata: { "x-custom-header": "test-value" },
      });

      try {
        const response = await client.call(
          "helloworld.Greeter/SayHello",
          { name: "World" },
          { metadata: { "x-request-id": "123" } },
        );

        expectGrpcResponse(response).ok();
      } finally {
        await client.close();
      }
    });

    await t.step("using with statement (AsyncDisposable)", async () => {
      await using client = await createGrpcClient({
        address: GRPC_ADDRESS,
        schema: PROTO_PATH,
      });

      const response = await client.call("helloworld.Greeter/SayHello", {
        name: "Disposable",
      });

      expectGrpcResponse(response).ok();
    });

    await t.step("timeout handling", async () => {
      const client = await createGrpcClient({
        address: GRPC_ADDRESS,
        schema: PROTO_PATH,
      });

      try {
        const response = await client.call(
          "helloworld.Greeter/SayHello",
          { name: "Timeout" },
          { timeout: 5000 },
        );

        expectGrpcResponse(response).ok();
      } finally {
        await client.close();
      }
    });

    await t.step("Server Reflection - discover and call service", async () => {
      const client = await createGrpcClient({
        address: GRPC_ADDRESS,
        schema: "reflection",
      });

      try {
        const response = await client.call("helloworld.Greeter/SayHello", {
          name: "Reflection",
        });

        expectGrpcResponse(response)
          .ok()
          .hasContent();

        const data = response.json<{ message: string }>();
        // Server returns "Hello, {name}!" format
        assertEquals(data?.message, "Hello, Reflection!");
      } finally {
        await client.close();
      }
    });
  },
});
