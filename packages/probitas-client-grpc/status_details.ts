import type { ErrorDetail } from "./errors.ts";
import protobuf from "protobufjs";

/**
 * Proto definitions for google.rpc.Status and related types.
 * These are embedded to avoid runtime file loading.
 */
const PROTO_DEFINITIONS = `
syntax = "proto3";

package google.protobuf;

message Any {
  string type_url = 1;
  bytes value = 2;
}

message Duration {
  int64 seconds = 1;
  int32 nanos = 2;
}
`;

const STATUS_PROTO = `
syntax = "proto3";

package google.rpc;

message Status {
  int32 code = 1;
  string message = 2;
  repeated google.protobuf.Any details = 3;
}

message BadRequest {
  message FieldViolation {
    string field = 1;
    string description = 2;
  }
  repeated FieldViolation field_violations = 1;
}

message DebugInfo {
  repeated string stack_entries = 1;
  string detail = 2;
}

message RetryInfo {
  google.protobuf.Duration retry_delay = 1;
}

message QuotaFailure {
  message Violation {
    string subject = 1;
    string description = 2;
  }
  repeated Violation violations = 1;
}
`;

// Initialize protobuf root with all definitions
// Note: We do NOT use keepCase: true so that field names are converted to camelCase
// (e.g., field_violations -> fieldViolations) for JavaScript-friendly API
const root = protobuf.parse(PROTO_DEFINITIONS).root;
protobuf.parse(STATUS_PROTO, root);

// Lookup types
const StatusType = root.lookupType("google.rpc.Status");
const BadRequestType = root.lookupType("google.rpc.BadRequest");
const DebugInfoType = root.lookupType("google.rpc.DebugInfo");
const RetryInfoType = root.lookupType("google.rpc.RetryInfo");
const QuotaFailureType = root.lookupType("google.rpc.QuotaFailure");

/**
 * Type name to protobuf type mapping for decoding detail values.
 */
const DETAIL_TYPES: Record<string, protobuf.Type> = {
  "google.rpc.BadRequest": BadRequestType,
  "google.rpc.DebugInfo": DebugInfoType,
  "google.rpc.RetryInfo": RetryInfoType,
  "google.rpc.QuotaFailure": QuotaFailureType,
};

/**
 * Parse error details from grpc-status-details-bin trailer.
 *
 * The trailer may be:
 * - A Uint8Array (binary)
 * - A string that could be:
 *   - Base64-encoded binary
 *   - Raw binary data as a string (when grpc-js returns -bin metadata as string)
 */
export function parseStatusDetails(
  statusDetailsBin: string | Uint8Array,
): ErrorDetail[] {
  try {
    let bytes: Uint8Array;

    if (statusDetailsBin instanceof Uint8Array) {
      bytes = statusDetailsBin;
    } else if (typeof statusDetailsBin === "string") {
      // Check if the string looks like base64 or raw binary
      // grpc-js often returns -bin metadata as raw binary string
      if (isLikelyBase64(statusDetailsBin)) {
        bytes = base64Decode(statusDetailsBin);
      } else {
        // Raw binary string - convert directly to Uint8Array
        bytes = stringToBytes(statusDetailsBin);
      }
    } else {
      return [];
    }

    // Decode google.rpc.Status
    const status = StatusType.decode(bytes);
    // deno-lint-ignore no-explicit-any
    const statusObj = status as any;

    if (!statusObj.details || !Array.isArray(statusObj.details)) {
      return [];
    }

    // Convert each Any to ErrorDetail
    return statusObj.details.map(
      (any: { typeUrl: string; value: Uint8Array }) => {
        const typeUrl = any.typeUrl;
        const decodedValue = decodeDetailValue(typeUrl, any.value);
        return {
          typeUrl,
          value: decodedValue,
        };
      },
    );
  } catch {
    // If parsing fails, return empty array rather than throwing
    return [];
  }
}

/**
 * Decode detail value based on its type URL.
 */
function decodeDetailValue(
  typeUrl: string,
  value: Uint8Array | null,
): unknown {
  if (!value) {
    return null;
  }

  // Extract type name from URL (e.g., "type.googleapis.com/google.rpc.BadRequest")
  const typeName = typeUrl.split("/").pop();
  if (!typeName) {
    return value;
  }

  const messageType = DETAIL_TYPES[typeName];
  if (!messageType) {
    // Return raw bytes for unknown types
    return value;
  }

  try {
    const decoded = messageType.decode(value);
    return messageType.toObject(decoded, {
      longs: Number,
      enums: String,
      bytes: Uint8Array,
    });
  } catch {
    return value;
  }
}

/**
 * Check if a string looks like base64-encoded data.
 * Base64 uses [A-Za-z0-9+/=] characters only.
 */
function isLikelyBase64(str: string): boolean {
  // If the string contains control characters or non-ASCII, it's probably raw binary
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Control characters (0-31) or DEL (127) suggest raw binary
    if (code < 32 || code === 127) {
      return false;
    }
  }
  // Additional check: valid base64 characters only
  return /^[A-Za-z0-9+/=_-]*$/.test(str);
}

/**
 * Convert a raw binary string to Uint8Array.
 * Each character's char code becomes a byte.
 */
function stringToBytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decode base64 string to Uint8Array.
 */
function base64Decode(encoded: string): Uint8Array {
  // Handle base64url encoding (used by some gRPC implementations)
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
