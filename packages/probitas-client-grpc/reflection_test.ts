import { assertEquals, assertExists, assertInstanceOf } from "@std/assert";
import * as grpc from "@grpc/grpc-js";
import {
  GrpcReflectionClient,
  type GrpcReflectionClientOptions,
  ReflectedDescriptor,
  type ReflectionVersion,
} from "./reflection.ts";

Deno.test("ReflectedDescriptor", async (t) => {
  await t.step("getPackageDefinition returns PackageDefinition", () => {
    // Create a minimal FileDescriptorProto binary
    // This is a simplified proto that just has a name field
    // In real usage, this would be a full FileDescriptorProto
    const descriptor = new ReflectedDescriptor([]);
    const packageDefinition = descriptor.getPackageDefinition();

    assertExists(packageDefinition);
    assertEquals(typeof packageDefinition, "object");
  });

  await t.step(
    "getPackageDefinition accepts protoLoader options",
    () => {
      const descriptor = new ReflectedDescriptor([]);
      const packageDefinition = descriptor.getPackageDefinition({
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
      });

      assertExists(packageDefinition);
    },
  );
});

Deno.test("GrpcReflectionClient", async (t) => {
  await t.step("constructor accepts address and credentials", () => {
    const client = new GrpcReflectionClient(
      "localhost:50051",
      grpc.credentials.createInsecure(),
    );

    assertExists(client);
    assertEquals(client.activeVersion, undefined);
    client.close();
  });

  await t.step("constructor accepts optional grpc options", () => {
    const client = new GrpcReflectionClient(
      "localhost:50051",
      grpc.credentials.createInsecure(),
      { "grpc.max_receive_message_length": 1024 * 1024 },
    );

    assertExists(client);
    client.close();
  });

  await t.step(
    "constructor accepts reflection options with preferredVersion",
    () => {
      const options: GrpcReflectionClientOptions = {
        preferredVersion: "v1alpha",
      };
      const client = new GrpcReflectionClient(
        "localhost:50051",
        grpc.credentials.createInsecure(),
        undefined,
        options,
      );

      assertExists(client);
      client.close();
    },
  );

  await t.step("activeVersion is undefined before first request", () => {
    const client = new GrpcReflectionClient(
      "localhost:50051",
      grpc.credentials.createInsecure(),
    );

    assertEquals(client.activeVersion, undefined);
    client.close();
  });

  await t.step("close() is idempotent", async () => {
    const client = new GrpcReflectionClient(
      "localhost:50051",
      grpc.credentials.createInsecure(),
    );

    await client.close();
    await client.close();
  });

  await t.step("implements AsyncDisposable", () => {
    const client = new GrpcReflectionClient(
      "localhost:50051",
      grpc.credentials.createInsecure(),
    );

    assertInstanceOf(client[Symbol.asyncDispose], Function);
    client.close();
  });

  await t.step(
    "[Symbol.asyncDispose]() calls close()",
    async () => {
      const client = new GrpcReflectionClient(
        "localhost:50051",
        grpc.credentials.createInsecure(),
      );

      await client[Symbol.asyncDispose]();
      // Should not throw when called again
      await client.close();
    },
  );
});

Deno.test("ReflectionVersion type", async (t) => {
  await t.step("v1 is a valid version", () => {
    const version: ReflectionVersion = "v1";
    assertEquals(version, "v1");
  });

  await t.step("v1alpha is a valid version", () => {
    const version: ReflectionVersion = "v1alpha";
    assertEquals(version, "v1alpha");
  });
});
