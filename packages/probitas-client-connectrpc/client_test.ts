/**
 * Tests for ConnectRPC client.
 */

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { fromBinary } from "@bufbuild/protobuf";
import { FileDescriptorSetSchema } from "@bufbuild/protobuf/wkt";
import { createConnectRpcClient } from "./client.ts";
import type { FileDescriptorSet } from "./types.ts";

Deno.test("createConnectRpcClient - creates client with reflection by default", async () => {
  const client = createConnectRpcClient({
    url: "http://localhost:50051",
  });

  try {
    assertExists(client);
    assertEquals(client.reflection.enabled, true);
    assertExists(client.config);
    assertEquals(client.config.url, "http://localhost:50051");
  } finally {
    await client.close();
  }
});

Deno.test("createConnectRpcClient - supports different protocols", async () => {
  const protocols = ["connect", "grpc", "grpc-web"] as const;

  for (const protocol of protocols) {
    const client = createConnectRpcClient({
      url: "http://localhost:50051",
      protocol,
    });

    try {
      assertExists(client);
      assertEquals(client.config.protocol, protocol);
    } finally {
      await client.close();
    }
  }
});

Deno.test("createConnectRpcClient - supports different HTTP versions", async () => {
  const versions = ["1.1", "2"] as const;

  for (const httpVersion of versions) {
    const client = createConnectRpcClient({
      url: "http://localhost:50051",
      httpVersion,
    });

    try {
      assertExists(client);
      assertEquals(client.config.httpVersion, httpVersion);
    } finally {
      await client.close();
    }
  }
});

Deno.test("createConnectRpcClient - handles TLS config", async () => {
  const client = createConnectRpcClient({
    url: "http://localhost:50051",
    tls: {
      insecure: true,
    },
  });

  try {
    assertExists(client);
    assertExists(client.config.tls);
    assertEquals(client.config.tls.insecure, true);
  } finally {
    await client.close();
  }
});

Deno.test("createConnectRpcClient - supports metadata", async () => {
  const client = createConnectRpcClient({
    url: "http://localhost:50051",
    metadata: {
      "x-custom-header": "value",
    },
  });

  try {
    assertExists(client);
    assertExists(client.config.metadata);
    const metadata = new Headers(client.config.metadata);
    assertEquals(metadata.get("x-custom-header"), "value");
  } finally {
    await client.close();
  }
});

Deno.test("createConnectRpcClient - using statement support", async () => {
  let closed = false;

  {
    await using client = createConnectRpcClient({
      url: "http://localhost:50051",
    });

    assertExists(client);

    // Override close to track if it was called
    const originalClose = client.close.bind(client);
    client.close = async () => {
      closed = true;
      return await originalClose();
    };
  }

  // Client should be automatically disposed
  assertEquals(closed, true);
});

Deno.test("createConnectRpcClient - throwOnError config option", async () => {
  const client = createConnectRpcClient({
    url: "http://localhost:50051",
    throwOnError: false,
  });

  try {
    assertExists(client);
    assertEquals(client.config.throwOnError, false);
  } finally {
    await client.close();
  }
});

Deno.test("createConnectRpcClient - supports Uint8Array schema (FileDescriptorSet)", async () => {
  // Create a minimal FileDescriptorSet binary for testing.
  // This is generated from a simple proto file using `buf build --output`.
  // For this test, we use an empty FileDescriptorSet which is valid but contains no services.
  //
  // In a real scenario, users would provide the output of:
  //   buf build proto --output set.binpb
  //
  // Empty FileDescriptorSet binary representation (just the wire format header)
  const emptyFileDescriptorSet = new Uint8Array([]);

  const client = createConnectRpcClient({
    url: "http://localhost:50051",
    schema: emptyFileDescriptorSet,
  });

  try {
    assertExists(client);
    // Reflection should be disabled when using Uint8Array schema
    assertEquals(client.reflection.enabled, false);
    assertEquals(client.config.schema, emptyFileDescriptorSet);
  } finally {
    await client.close();
  }
});

Deno.test("createConnectRpcClient - Uint8Array schema creates FileRegistry for RPC calls", async () => {
  // Empty FileDescriptorSet - valid proto binary that decodes to empty file list
  const emptyFileDescriptorSet = new Uint8Array([]);

  const client = createConnectRpcClient({
    url: "http://localhost:50051",
    schema: emptyFileDescriptorSet,
  });

  try {
    // Attempting to call a method should NOT throw "Reflection is not enabled" error.
    // Instead, it should throw a connection error or "service not found" error
    // because the FileDescriptorSet is empty.
    // This verifies that FileRegistry is properly created from Uint8Array.
    try {
      await client.call("test.Service", "Method", {});
    } catch (error) {
      // Should NOT be "Reflection is not enabled" error
      const message = error instanceof Error ? error.message : String(error);
      assertEquals(
        message.includes("Reflection is not enabled"),
        false,
        `Expected FileRegistry to be created from Uint8Array, but got: ${message}`,
      );
    }
  } finally {
    await client.close();
  }
});

Deno.test("createConnectRpcClient - FileDescriptorSet object schema creates FileRegistry", async () => {
  // Create a FileDescriptorSet object from empty binary
  const emptyBytes = new Uint8Array([]);
  const fileDescriptorSet: FileDescriptorSet = fromBinary(
    FileDescriptorSetSchema,
    emptyBytes,
  );

  const client = createConnectRpcClient({
    url: "http://localhost:50051",
    schema: fileDescriptorSet,
  });

  try {
    assertExists(client);
    // Reflection should be disabled when using FileDescriptorSet object
    assertEquals(client.reflection.enabled, false);

    // Attempting to call a method should NOT throw "Reflection is not enabled" error
    try {
      await client.call("test.Service", "Method", {});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assertEquals(
        message.includes("Reflection is not enabled"),
        false,
        `Expected FileRegistry to be created from FileDescriptorSet, but got: ${message}`,
      );
    }
  } finally {
    await client.close();
  }
});

Deno.test("createConnectRpcClient - string schema loads file and creates FileRegistry", async () => {
  // Create a temporary file with empty FileDescriptorSet binary
  const tempFile = await Deno.makeTempFile({ suffix: ".binpb" });
  try {
    // Write empty FileDescriptorSet binary to file
    await Deno.writeFile(tempFile, new Uint8Array([]));

    const client = createConnectRpcClient({
      url: "http://localhost:50051",
      schema: tempFile,
    });

    try {
      assertExists(client);
      // Reflection should be disabled when using file path
      assertEquals(client.reflection.enabled, false);

      // Attempting to call a method should NOT throw "Reflection is not enabled" error
      try {
        await client.call("test.Service", "Method", {});
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assertEquals(
          message.includes("Reflection is not enabled"),
          false,
          `Expected FileRegistry to be created from file, but got: ${message}`,
        );
      }
    } finally {
      await client.close();
    }
  } finally {
    await Deno.remove(tempFile);
  }
});

Deno.test("createConnectRpcClient - string schema throws on non-existent file", async () => {
  await assertRejects(
    async () => {
      const client = createConnectRpcClient({
        url: "http://localhost:50051",
        schema: "/non/existent/path/to/schema.binpb",
      });
      // Client creation is synchronous for file loading, so this should throw immediately
      // But we need to ensure the client is closed if creation somehow succeeds
      await client.close();
    },
    Deno.errors.NotFound,
  );
});
