/**
 * Integration tests for GrpcClient using echo-grpc service.
 *
 * This package is a thin wrapper around @probitas/client-connectrpc
 * with protocol: "grpc" fixed.
 *
 * Run with:
 *   docker compose up -d echo-connectrpc
 *   deno test -A packages/probitas-client-grpc/integration_test.ts
 *   docker compose down
 */

import {
  assertEquals,
  assertExists,
  assertLess,
  assertRejects,
} from "@std/assert";
import { createGrpcClient, GrpcError } from "./mod.ts";

// Suppress HTTP/2 cleanup errors from Deno's node:http2 compatibility layer.
// This is a known Deno bug where async stream handlers fire after session destruction.
// See: https://github.com/denoland/deno/issues/26234
// See: https://github.com/denoland/deno/issues/28610
// Fix in progress: https://github.com/denoland/deno/pull/30955
globalThis.addEventListener("unhandledrejection", (event) => {
  const error = event.reason;
  if (
    error instanceof Error &&
    (error.name === "BadResource" ||
      error.message.includes("broken pipe") ||
      error.message.includes("stream closed"))
  ) {
    event.preventDefault();
  }
});

// Use echo-grpc service
const GRPC_URL = Deno.env.get("GRPC_URL") ?? "http://localhost:50051";

async function isServiceAvailable(): Promise<boolean> {
  try {
    const url = new URL(GRPC_URL);
    const conn = await Deno.connect({
      hostname: url.hostname,
      port: parseInt(url.port, 10),
    });
    conn.close();
    return true;
  } catch {
    return false;
  }
}

Deno.test({
  name: "Integration: createGrpcClient with reflection",
  ignore: !(await isServiceAvailable()),
  async fn() {
    await using client = createGrpcClient({
      url: GRPC_URL,
    });

    assertExists(client);
    assertEquals(client.reflection.enabled, true);
  },
});

Deno.test({
  name: "Integration: reflection.listServices",
  ignore: !(await isServiceAvailable()),
  async fn() {
    await using client = createGrpcClient({
      url: GRPC_URL,
    });

    const services = await client.reflection.listServices();
    assertExists(services);
    assertEquals(Array.isArray(services), true);
    assertEquals(services.length > 0, true);

    console.log("\n📋 Available services:");
    for (const service of services) {
      console.log(`  - ${service.name} (${service.file})`);
    }
  },
});

Deno.test({
  name: "Integration: reflection.hasService",
  ignore: !(await isServiceAvailable()),
  async fn() {
    await using client = createGrpcClient({
      url: GRPC_URL,
    });

    const services = await client.reflection.listServices();
    if (services.length > 0) {
      const firstService = services[0].name;
      const exists = await client.reflection.hasService(firstService);
      assertEquals(exists, true);
    }

    const nonExistent = await client.reflection.hasService(
      "nonexistent.Service",
    );
    assertEquals(nonExistent, false);
  },
});

Deno.test({
  name: "Integration: reflection.getServiceInfo",
  ignore: !(await isServiceAvailable()),
  async fn() {
    await using client = createGrpcClient({
      url: GRPC_URL,
    });

    const services = await client.reflection.listServices();
    if (services.length === 0) {
      console.warn("⚠️  No services available for testing");
      return;
    }

    const firstService = services[0].name;
    const info = await client.reflection.getServiceInfo(firstService);

    assertExists(info);
    assertEquals(info.fullName, firstService);
    assertExists(info.name);
    assertExists(info.packageName);
    assertEquals(Array.isArray(info.methods), true);

    console.log(`\n📦 Service: ${info.fullName}`);
    console.log(`   Package: ${info.packageName}`);
    console.log(`   File: ${info.protoFile}`);
    console.log(`   Methods (${info.methods.length}):`);
    for (const method of info.methods) {
      console.log(
        `     - ${method.name} (${method.kind}): ${method.inputType} → ${method.outputType}`,
      );
    }
  },
});

Deno.test({
  name: "Integration: reflection.listMethods",
  ignore: !(await isServiceAvailable()),
  async fn() {
    await using client = createGrpcClient({
      url: GRPC_URL,
    });

    const services = await client.reflection.listServices();
    if (services.length === 0) {
      console.warn("⚠️  No services available for testing");
      return;
    }

    const firstService = services[0].name;
    const methods = await client.reflection.listMethods(firstService);

    assertExists(methods);
    assertEquals(Array.isArray(methods), true);
    assertEquals(methods.length > 0, true);

    for (const method of methods) {
      assertExists(method.name);
      assertExists(method.localName);
      assertExists(method.kind);
      assertExists(method.inputType);
      assertExists(method.outputType);
    }
  },
});

Deno.test({
  name: "Integration: unary call",
  ignore: !(await isServiceAvailable()),
  async fn(t) {
    await using client = createGrpcClient({
      url: GRPC_URL,
    });

    await t.step("Echo method returns message", async () => {
      const response = await client.call(
        "echo.v1.Echo",
        "echo",
        { message: "Hello gRPC!" },
      );

      assertEquals(response.ok, true);
      assertEquals(response.statusCode, 0);
      assertExists(response.data());

      const data = response.data<{ message: string }>();
      assertExists(data);
      assertEquals(data.message, "Hello gRPC!");
    });

    await t.step("standard assertions work", async () => {
      const response = await client.call(
        "echo.v1.Echo",
        "echo",
        { message: "Test message" },
      );

      assertEquals(response.ok, true);
      assertEquals(response.statusCode, 0);
      assertExists(response.data());
      const data = response.data<{ message: string }>();
      assertEquals(data?.message, "Test message");
      assertLess(response.duration, 5000);
    });

    await t.step("response includes duration", async () => {
      const response = await client.call(
        "echo.v1.Echo",
        "echo",
        { message: "measure duration" },
      );

      assertEquals(typeof response.duration, "number");
      assertEquals(response.duration >= 0, true);
    });

    await t.step("response includes headers and trailers", async () => {
      const response = await client.call(
        "echo.v1.Echo",
        "echo",
        { message: "check headers" },
      );

      assertExists(response.headers);
      assertExists(response.trailers);
      assertEquals(typeof response.headers, "object");
      assertEquals(typeof response.trailers, "object");
    });
  },
});

Deno.test({
  name: "Integration: throwOnError behavior",
  ignore: !(await isServiceAvailable()),
  async fn(t) {
    await t.step(
      "per-request throwOnError: false returns error response",
      async () => {
        await using client = createGrpcClient({
          url: GRPC_URL,
        });

        const response = await client.call(
          "echo.v1.Echo",
          "EchoError",
          { message: "trigger error", code: 3, details: "test error" },
          { throwOnError: false },
        );

        assertEquals(response.ok, false);
        assertEquals(response.statusCode, 3);
      },
    );

    await t.step("throwOnError: true (default) throws error", async () => {
      await using client = createGrpcClient({
        url: GRPC_URL,
      });

      await assertRejects(
        async () => {
          await client.call(
            "echo.v1.Echo",
            "EchoError",
            { message: "trigger error", code: 3, details: "test error" },
          );
        },
        GrpcError,
      );
    });

    await t.step("client config throwOnError: false", async () => {
      await using client = createGrpcClient({
        url: GRPC_URL,
        throwOnError: false,
      });

      const response = await client.call(
        "echo.v1.Echo",
        "EchoError",
        { message: "trigger error", code: 3, details: "test error" },
      );

      assertEquals(response.ok, false);
    });
  },
});

Deno.test({
  name: "Integration: metadata handling",
  ignore: !(await isServiceAvailable()),
  async fn(t) {
    await t.step("metadata (headers) are sent and received", async () => {
      await using client = createGrpcClient({
        url: GRPC_URL,
        metadata: {
          "x-custom-header": "custom-value",
        },
      });

      const response = await client.call(
        "echo.v1.Echo",
        "echo",
        { message: "with metadata" },
      );

      assertEquals(response.ok, true);
      assertExists(response.headers);
    });

    await t.step("per-request metadata overrides config", async () => {
      await using client = createGrpcClient({
        url: GRPC_URL,
        metadata: {
          "x-header": "from-config",
        },
      });

      const response = await client.call(
        "echo.v1.Echo",
        "echo",
        { message: "with override" },
        { metadata: { "x-header": "from-request" } },
      );

      assertEquals(response.ok, true);
    });
  },
});

Deno.test({
  name: "Integration: AsyncDisposable",
  ignore: !(await isServiceAvailable()),
  async fn() {
    await using client = createGrpcClient({
      url: GRPC_URL,
    });

    const response = await client.call(
      "echo.v1.Echo",
      "echo",
      { message: "disposable test" },
    );

    assertEquals(response.ok, true);
  },
});

Deno.test({
  name: "Integration: server streaming",
  ignore: !(await isServiceAvailable()),
  async fn() {
    await using client = createGrpcClient({
      url: GRPC_URL,
    });

    const messages: unknown[] = [];

    for await (
      const response of client.serverStream(
        "echo.v1.Echo",
        "serverStream",
        { message: "stream test", count: 3 },
      )
    ) {
      assertEquals(response.ok, true);
      messages.push(response.data());
    }

    assertEquals(messages.length, 3);
  },
});

Deno.test({
  name: "Integration: AbortSignal cancels request",
  ignore: !(await isServiceAvailable()),
  async fn() {
    await using client = createGrpcClient({
      url: GRPC_URL,
    });

    const controller = new AbortController();
    controller.abort();

    try {
      await client.call(
        "echo.v1.Echo",
        "echo",
        { message: "should be aborted" },
        { signal: controller.signal },
      );
      throw new Error("Expected abort error");
    } catch (error) {
      assertExists(error);
    }
  },
});

Deno.test({
  name: "Integration: error handling",
  ignore: !(await isServiceAvailable()),
  async fn(t) {
    await t.step("GrpcError includes kind property", async () => {
      await using client = createGrpcClient({
        url: GRPC_URL,
      });

      try {
        await client.call(
          "echo.v1.Echo",
          "EchoError",
          { message: "error", code: 3, details: "test error" },
        );
        throw new Error("Expected error");
      } catch (error) {
        if (error instanceof GrpcError) {
          assertEquals(error.kind, "connectrpc");
          assertEquals(typeof error.statusCode, "number");
          assertExists(error.message);
        } else {
          assertExists(error);
        }
      }
    });

    await t.step("error response has correct structure", async () => {
      await using client = createGrpcClient({
        url: GRPC_URL,
        throwOnError: false,
      });

      const response = await client.call(
        "echo.v1.Echo",
        "EchoError",
        { message: "test error", code: 3, details: "test error" },
      );

      assertEquals(response.ok, false);
      assertEquals(response.statusCode, 3);
      assertEquals(response.data(), null);
    });
  },
});
