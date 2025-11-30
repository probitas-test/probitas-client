/**
 * Integration tests for GrpcClient using echo-grpc.
 *
 * Run with:
 *   docker compose up -d echo-grpc
 *   deno test -A packages/probitas-client-grpc/integration_test.ts
 *   docker compose down
 */

import { assertEquals, assertInstanceOf, assertRejects } from "@std/assert";
import { createGrpcClient } from "./client.ts";
import { expectGrpcResponse } from "./expect.ts";
import { GrpcError } from "./errors.ts";

const GRPC_ADDRESS = Deno.env.get("GRPC_ADDRESS") ?? "localhost:50051";
const PROTO_PATH = new URL("./testdata/echo.proto", import.meta.url).pathname;

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
  name: "Integration: echo-grpc",
  ignore: !(await isGrpcServerAvailable()),
  // grpc-js DNS resolver cannot cancel in-flight DNS requests on close().
  // This is a known limitation: https://github.com/denoland/deno/issues/28307
  sanitizeOps: false,
  async fn(t) {
    await t.step("unary call - Echo", async () => {
      const client = await createGrpcClient({
        address: GRPC_ADDRESS,
        schema: PROTO_PATH,
      });

      try {
        const response = await client.call("echo.v1.Echo/Echo", {
          message: "Hello, Probitas!",
        });

        expectGrpcResponse(response)
          .ok()
          .hasContent();

        const data = response.json<{ message: string }>();
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
          "echo.v1.Echo/Echo",
          { message: "Hello with metadata" },
          { metadata: { "x-request-id": "123" } },
        );

        expectGrpcResponse(response).ok();

        // echo-grpc includes metadata in response
        const data = response.json<{
          message: string;
          metadata: Record<string, string>;
        }>();
        assertEquals(data?.message, "Hello with metadata");
        // Verify metadata was echoed back
        assertInstanceOf(data?.metadata, Object);
      } finally {
        await client.close();
      }
    });

    await t.step("EchoWithDelay for latency testing", async () => {
      const client = await createGrpcClient({
        address: GRPC_ADDRESS,
        schema: PROTO_PATH,
      });

      try {
        const start = Date.now();
        const response = await client.call("echo.v1.Echo/EchoWithDelay", {
          message: "Delayed message",
          delay_ms: 500,
        });
        const elapsed = Date.now() - start;

        expectGrpcResponse(response).ok();

        const data = response.json<{ message: string }>();
        assertEquals(data?.message, "Delayed message");

        // Should have taken at least 500ms
        assertEquals(
          elapsed >= 450,
          true,
          `Expected elapsed >= 450ms, got ${elapsed}ms`,
        );
      } finally {
        await client.close();
      }
    });

    await t.step("EchoError returns gRPC error", async () => {
      const client = await createGrpcClient({
        address: GRPC_ADDRESS,
        schema: PROTO_PATH,
      });

      try {
        await assertRejects(
          async () => {
            await client.call("echo.v1.Echo/EchoError", {
              message: "Error test",
              code: 3, // INVALID_ARGUMENT
              details: "Test error message",
            });
          },
          GrpcError,
          "INVALID_ARGUMENT",
        );
      } finally {
        await client.close();
      }
    });

    await t.step("using with statement (AsyncDisposable)", async () => {
      await using client = await createGrpcClient({
        address: GRPC_ADDRESS,
        schema: PROTO_PATH,
      });

      const response = await client.call("echo.v1.Echo/Echo", {
        message: "Disposable test",
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
          "echo.v1.Echo/Echo",
          { message: "Timeout test" },
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
        const response = await client.call("echo.v1.Echo/Echo", {
          message: "Reflection test",
        });

        expectGrpcResponse(response)
          .ok()
          .hasContent();

        const data = response.json<{ message: string }>();
        assertEquals(data?.message, "Reflection test");
      } finally {
        await client.close();
      }
    });

    await t.step("ServerStream - receive multiple responses", async () => {
      const client = await createGrpcClient({
        address: GRPC_ADDRESS,
        schema: PROTO_PATH,
      });

      try {
        const responses: string[] = [];
        for await (
          const response of client.serverStream("echo.v1.Echo/ServerStream", {
            message: "Stream test",
            count: 3,
            interval_ms: 100,
          })
        ) {
          expectGrpcResponse(response).ok();
          const data = response.json<{ message: string }>();
          responses.push(data?.message ?? "");
        }

        assertEquals(responses.length, 3);
        // Server appends index to each message: "Stream test [1/3]", "Stream test [2/3]", etc.
        assertEquals(responses[0], "Stream test [1/3]");
        assertEquals(responses[1], "Stream test [2/3]");
        assertEquals(responses[2], "Stream test [3/3]");
      } finally {
        await client.close();
      }
    });

    await t.step("ClientStream - send multiple requests", async () => {
      const client = await createGrpcClient({
        address: GRPC_ADDRESS,
        schema: PROTO_PATH,
      });

      const generateRequests = async function* () {
        yield { message: "Hello" };
        yield { message: "World" };
        yield { message: "!" };
      };

      try {
        const response = await client.clientStream(
          "echo.v1.Echo/ClientStream",
          generateRequests(),
        );

        expectGrpcResponse(response).ok();
        const data = response.json<{ message: string }>();
        // Server concatenates all messages
        assertEquals(data?.message, "Hello, World, !");
      } finally {
        await client.close();
      }
    });

    await t.step("BidirectionalStream - echo each message", async () => {
      const client = await createGrpcClient({
        address: GRPC_ADDRESS,
        schema: PROTO_PATH,
      });

      const generateRequests = async function* () {
        yield { message: "First" };
        yield { message: "Second" };
        yield { message: "Third" };
      };

      try {
        const responses: string[] = [];
        for await (
          const response of client.bidiStream(
            "echo.v1.Echo/BidirectionalStream",
            generateRequests(),
          )
        ) {
          expectGrpcResponse(response).ok();
          const data = response.json<{ message: string }>();
          responses.push(data?.message ?? "");
        }

        assertEquals(responses.length, 3);
        assertEquals(responses[0], "First");
        assertEquals(responses[1], "Second");
        assertEquals(responses[2], "Third");
      } finally {
        await client.close();
      }
    });
  },
});
