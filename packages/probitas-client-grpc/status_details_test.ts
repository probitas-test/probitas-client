import { assertEquals } from "@std/assert";
import { parseStatusDetails } from "./status_details.ts";

/**
 * Helper to encode a protobuf message.
 * This is a minimal encoder for creating test data.
 */
function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return new Uint8Array(bytes);
}

function encodeTag(fieldNumber: number, wireType: number): Uint8Array {
  return encodeVarint((fieldNumber << 3) | wireType);
}

function encodeLengthDelimited(
  fieldNumber: number,
  data: Uint8Array,
): Uint8Array {
  const tag = encodeTag(fieldNumber, 2);
  const length = encodeVarint(data.length);
  const result = new Uint8Array(tag.length + length.length + data.length);
  result.set(tag, 0);
  result.set(length, tag.length);
  result.set(data, tag.length + length.length);
  return result;
}

function encodeString(fieldNumber: number, value: string): Uint8Array {
  return encodeLengthDelimited(fieldNumber, new TextEncoder().encode(value));
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

Deno.test("parseStatusDetails", async (t) => {
  await t.step("returns empty array for empty input", () => {
    const result = parseStatusDetails(new Uint8Array(0));
    assertEquals(result, []);
  });

  await t.step("returns empty array for invalid input", () => {
    const result = parseStatusDetails("not-valid-base64!!!");
    assertEquals(result, []);
  });

  await t.step("parses google.protobuf.Any with type_url only", () => {
    // Build a google.protobuf.Any message
    const typeUrl = encodeString(
      1,
      "type.googleapis.com/google.rpc.CustomError",
    );
    const anyMessage = typeUrl;

    // Build a google.rpc.Status message with the Any in field 3 (details)
    const status = encodeLengthDelimited(3, anyMessage);

    const result = parseStatusDetails(toBase64(status));

    assertEquals(result.length, 1);
    assertEquals(
      result[0].typeUrl,
      "type.googleapis.com/google.rpc.CustomError",
    );
  });

  await t.step("parses BadRequest error detail", () => {
    // Build FieldViolation: { field: "email", description: "invalid format" }
    const fieldViolation = concat(
      encodeString(1, "email"),
      encodeString(2, "invalid format"),
    );

    // Build BadRequest: { field_violations: [fieldViolation] }
    const badRequest = encodeLengthDelimited(1, fieldViolation);

    // Build Any: { type_url: ..., value: badRequest }
    const anyMessage = concat(
      encodeString(1, "type.googleapis.com/google.rpc.BadRequest"),
      encodeLengthDelimited(2, badRequest),
    );

    // Build Status: { details: [anyMessage] }
    const status = encodeLengthDelimited(3, anyMessage);

    const result = parseStatusDetails(toBase64(status));

    assertEquals(result.length, 1);
    assertEquals(
      result[0].typeUrl,
      "type.googleapis.com/google.rpc.BadRequest",
    );
    assertEquals(result[0].value, {
      fieldViolations: [{ field: "email", description: "invalid format" }],
    });
  });

  await t.step("parses DebugInfo error detail", () => {
    // Build DebugInfo: { stack_entries: ["line1", "line2"], detail: "debug info" }
    const debugInfo = concat(
      encodeString(1, "at function1()"),
      encodeString(1, "at function2()"),
      encodeString(2, "Something went wrong"),
    );

    // Build Any
    const anyMessage = concat(
      encodeString(1, "type.googleapis.com/google.rpc.DebugInfo"),
      encodeLengthDelimited(2, debugInfo),
    );

    // Build Status
    const status = encodeLengthDelimited(3, anyMessage);

    const result = parseStatusDetails(toBase64(status));

    assertEquals(result.length, 1);
    assertEquals(result[0].typeUrl, "type.googleapis.com/google.rpc.DebugInfo");
    assertEquals(result[0].value, {
      stackEntries: ["at function1()", "at function2()"],
      detail: "Something went wrong",
    });
  });

  await t.step("parses RetryInfo error detail", () => {
    // Build Duration: { seconds: 5, nanos: 500000000 }
    const duration = concat(
      concat(encodeTag(1, 0), encodeVarint(5)), // seconds
      concat(encodeTag(2, 0), encodeVarint(500000000)), // nanos
    );

    // Build RetryInfo: { retry_delay: duration }
    const retryInfo = encodeLengthDelimited(1, duration);

    // Build Any
    const anyMessage = concat(
      encodeString(1, "type.googleapis.com/google.rpc.RetryInfo"),
      encodeLengthDelimited(2, retryInfo),
    );

    // Build Status
    const status = encodeLengthDelimited(3, anyMessage);

    const result = parseStatusDetails(toBase64(status));

    assertEquals(result.length, 1);
    assertEquals(result[0].typeUrl, "type.googleapis.com/google.rpc.RetryInfo");
    assertEquals(result[0].value, {
      retryDelay: { seconds: 5, nanos: 500000000 },
    });
  });

  await t.step("parses QuotaFailure error detail", () => {
    // Build Violation: { subject: "user:123", description: "quota exceeded" }
    const violation = concat(
      encodeString(1, "user:123"),
      encodeString(2, "quota exceeded"),
    );

    // Build QuotaFailure: { violations: [violation] }
    const quotaFailure = encodeLengthDelimited(1, violation);

    // Build Any
    const anyMessage = concat(
      encodeString(1, "type.googleapis.com/google.rpc.QuotaFailure"),
      encodeLengthDelimited(2, quotaFailure),
    );

    // Build Status
    const status = encodeLengthDelimited(3, anyMessage);

    const result = parseStatusDetails(toBase64(status));

    assertEquals(result.length, 1);
    assertEquals(
      result[0].typeUrl,
      "type.googleapis.com/google.rpc.QuotaFailure",
    );
    assertEquals(result[0].value, {
      violations: [{ subject: "user:123", description: "quota exceeded" }],
    });
  });

  await t.step("parses multiple error details", () => {
    // Build two Any messages
    const anyMessage1 = concat(
      encodeString(1, "type.googleapis.com/google.rpc.BadRequest"),
      encodeLengthDelimited(
        2,
        encodeLengthDelimited(
          1,
          concat(encodeString(1, "field1"), encodeString(2, "error1")),
        ),
      ),
    );

    const anyMessage2 = concat(
      encodeString(1, "type.googleapis.com/google.rpc.DebugInfo"),
      encodeLengthDelimited(
        2,
        encodeString(2, "debug detail"),
      ),
    );

    // Build Status with two details
    const status = concat(
      encodeLengthDelimited(3, anyMessage1),
      encodeLengthDelimited(3, anyMessage2),
    );

    const result = parseStatusDetails(toBase64(status));

    assertEquals(result.length, 2);
    assertEquals(
      result[0].typeUrl,
      "type.googleapis.com/google.rpc.BadRequest",
    );
    assertEquals(result[1].typeUrl, "type.googleapis.com/google.rpc.DebugInfo");
  });

  await t.step("handles unknown type URLs gracefully", () => {
    // Build Any with unknown type
    const anyMessage = concat(
      encodeString(1, "type.googleapis.com/custom.UnknownType"),
      encodeLengthDelimited(2, new Uint8Array([1, 2, 3, 4])),
    );

    // Build Status
    const status = encodeLengthDelimited(3, anyMessage);

    const result = parseStatusDetails(toBase64(status));

    assertEquals(result.length, 1);
    assertEquals(
      result[0].typeUrl,
      "type.googleapis.com/custom.UnknownType",
    );
    // Unknown types return the raw bytes
    assertEquals(result[0].value, new Uint8Array([1, 2, 3, 4]));
  });

  await t.step("handles base64url encoding", () => {
    // Build a simple Any message
    const anyMessage = encodeString(
      1,
      "type.googleapis.com/google.rpc.DebugInfo",
    );
    const status = encodeLengthDelimited(3, anyMessage);

    // Convert to base64url (replace + with -, / with _)
    const base64 = toBase64(status);
    const base64url = base64.replace(/\+/g, "-").replace(/\//g, "_");

    const result = parseStatusDetails(base64url);

    assertEquals(result.length, 1);
    assertEquals(
      result[0].typeUrl,
      "type.googleapis.com/google.rpc.DebugInfo",
    );
  });
});
