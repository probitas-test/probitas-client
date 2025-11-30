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

    await t.step("EchoRequestMetadata - verify metadata delivery", async () => {
      const client = await createGrpcClient({
        address: GRPC_ADDRESS,
        schema: PROTO_PATH,
        metadata: { "x-client-id": "probitas-test" },
      });

      try {
        const response = await client.call(
          "echo.v1.Echo/EchoRequestMetadata",
          { keys: [] },
          {
            metadata: { "x-request-id": "req-123", "x-trace-id": "trace-456" },
          },
        );

        expectGrpcResponse(response).ok().hasContent();

        const data = response.json<{
          metadata: Record<string, { values: string[] }>;
        }>();

        // Verify config-level metadata was sent
        assertEquals(data?.metadata["x-client-id"]?.values[0], "probitas-test");
        // Verify request-level metadata was sent
        assertEquals(data?.metadata["x-request-id"]?.values[0], "req-123");
        assertEquals(data?.metadata["x-trace-id"]?.values[0], "trace-456");
      } finally {
        await client.close();
      }
    });

    await t.step("EchoDeadline - verify timeout propagation", async () => {
      const client = await createGrpcClient({
        address: GRPC_ADDRESS,
        schema: PROTO_PATH,
      });

      try {
        const response = await client.call(
          "echo.v1.Echo/EchoDeadline",
          { message: "Deadline test" },
          { timeout: 5000 },
        );

        expectGrpcResponse(response).ok().hasContent();

        const data = response.json<{
          message: string;
          deadline_remaining_ms: string;
          has_deadline: boolean;
        }>();

        assertEquals(data?.message, "Deadline test");
        assertEquals(data?.has_deadline, true);
        // Deadline should be less than 5000ms (some time passed during RPC)
        const remaining = parseInt(data?.deadline_remaining_ms ?? "0", 10);
        assertEquals(
          remaining > 0 && remaining <= 5000,
          true,
          `Expected deadline between 0-5000ms, got ${remaining}ms`,
        );
      } finally {
        await client.close();
      }
    });

    await t.step("EchoWithTrailers - verify trailing metadata", async () => {
      const client = await createGrpcClient({
        address: GRPC_ADDRESS,
        schema: PROTO_PATH,
      });

      try {
        const response = await client.call("echo.v1.Echo/EchoWithTrailers", {
          message: "Trailers test",
          trailers: {
            "x-custom-trailer": "custom-value",
            "x-request-id": "req-456",
          },
        });

        expectGrpcResponse(response)
          .ok()
          .hasContent()
          .trailersExist("x-custom-trailer")
          .trailers("x-custom-trailer", "custom-value")
          .trailers("x-request-id", "req-456");

        const data = response.json<{ message: string }>();
        assertEquals(data?.message, "Trailers test");

        // Also verify trailers are accessible directly
        assertEquals(response.trailers["x-custom-trailer"], "custom-value");
        assertEquals(response.trailers["x-request-id"], "req-456");
      } finally {
        await client.close();
      }
    });

    await t.step(
      "EchoErrorWithDetails - error with BadRequest details",
      async () => {
        const client = await createGrpcClient({
          address: GRPC_ADDRESS,
          schema: PROTO_PATH,
        });

        try {
          await client.call("echo.v1.Echo/EchoErrorWithDetails", {
            code: 3, // INVALID_ARGUMENT
            message: "Validation failed",
            details: [
              {
                type: "bad_request",
                field_violations: [
                  { field: "email", description: "invalid email format" },
                  { field: "age", description: "must be positive" },
                ],
              },
            ],
          });
          throw new Error("Expected GrpcError");
        } catch (error) {
          assertInstanceOf(error, GrpcError);
          assertEquals(error.code, 3);
          // grpcMessage includes the full error string from gRPC
          assertEquals(
            error.grpcMessage.includes("Validation failed"),
            true,
            `Expected grpcMessage to contain "Validation failed", got: ${error.grpcMessage}`,
          );

          // Verify error details were parsed
          assertEquals(error.details.length >= 1, true);
          const badRequest = error.details.find(
            (d) => d.typeUrl.includes("BadRequest"),
          );
          assertEquals(badRequest !== undefined, true);

          // Verify the parsed BadRequest structure
          const value = badRequest?.value as {
            fieldViolations: Array<{ field: string; description: string }>;
          };
          assertEquals(Array.isArray(value?.fieldViolations), true);
          assertEquals(value?.fieldViolations.length, 2);
          assertEquals(value?.fieldViolations[0].field, "email");
          assertEquals(
            value?.fieldViolations[0].description,
            "invalid email format",
          );
        } finally {
          await client.close();
        }
      },
    );

    await t.step(
      "EchoErrorWithDetails - error with DebugInfo details",
      async () => {
        const client = await createGrpcClient({
          address: GRPC_ADDRESS,
          schema: PROTO_PATH,
        });

        try {
          await client.call("echo.v1.Echo/EchoErrorWithDetails", {
            code: 13, // INTERNAL
            message: "Internal error occurred",
            details: [
              {
                type: "debug_info",
                stack_entries: ["at handler()", "at server.serve()"],
                debug_detail: "Null pointer exception",
              },
            ],
          });
          throw new Error("Expected GrpcError");
        } catch (error) {
          assertInstanceOf(error, GrpcError);
          assertEquals(error.code, 13);

          const debugInfo = error.details.find(
            (d) => d.typeUrl.includes("DebugInfo"),
          );
          assertEquals(debugInfo !== undefined, true);

          const value = debugInfo?.value as {
            stackEntries: string[];
            detail: string;
          };
          assertEquals(Array.isArray(value?.stackEntries), true);
          assertEquals(value?.stackEntries.length, 2);
          assertEquals(value?.detail, "Null pointer exception");
        } finally {
          await client.close();
        }
      },
    );

    await t.step(
      "EchoErrorWithDetails - error with RetryInfo details",
      async () => {
        const client = await createGrpcClient({
          address: GRPC_ADDRESS,
          schema: PROTO_PATH,
        });

        try {
          await client.call("echo.v1.Echo/EchoErrorWithDetails", {
            code: 14, // UNAVAILABLE
            message: "Service temporarily unavailable",
            details: [
              {
                type: "retry_info",
                retry_delay_ms: 5000,
              },
            ],
          });
          throw new Error("Expected GrpcError");
        } catch (error) {
          assertInstanceOf(error, GrpcError);
          assertEquals(error.code, 14);

          const retryInfo = error.details.find(
            (d) => d.typeUrl.includes("RetryInfo"),
          );
          assertEquals(retryInfo !== undefined, true);

          const value = retryInfo?.value as {
            retryDelay: { seconds: number; nanos: number } | null;
          };
          assertEquals(value?.retryDelay !== null, true);
          // 5000ms = 5 seconds
          assertEquals(value?.retryDelay?.seconds, 5);
        } finally {
          await client.close();
        }
      },
    );

    await t.step(
      "EchoErrorWithDetails - error with QuotaFailure details",
      async () => {
        const client = await createGrpcClient({
          address: GRPC_ADDRESS,
          schema: PROTO_PATH,
        });

        try {
          await client.call("echo.v1.Echo/EchoErrorWithDetails", {
            code: 8, // RESOURCE_EXHAUSTED
            message: "Quota exceeded",
            details: [
              {
                type: "quota_failure",
                quota_violations: [
                  {
                    subject: "user:alice",
                    description: "Daily request limit exceeded",
                  },
                ],
              },
            ],
          });
          throw new Error("Expected GrpcError");
        } catch (error) {
          assertInstanceOf(error, GrpcError);
          assertEquals(error.code, 8);

          const quotaFailure = error.details.find(
            (d) => d.typeUrl.includes("QuotaFailure"),
          );
          assertEquals(quotaFailure !== undefined, true);

          const value = quotaFailure?.value as {
            violations: Array<{ subject: string; description: string }>;
          };
          assertEquals(Array.isArray(value?.violations), true);
          assertEquals(value?.violations[0].subject, "user:alice");
        } finally {
          await client.close();
        }
      },
    );
  },
});
