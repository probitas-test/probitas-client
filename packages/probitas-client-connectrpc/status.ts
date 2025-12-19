/**
 * ConnectRPC/gRPC status codes as defined in the gRPC specification.
 * @see https://grpc.io/docs/guides/status-codes/
 * @see https://connectrpc.com/docs/protocol#error-codes
 *
 * @module
 */

/**
 * ConnectRPC/gRPC status codes.
 * These codes are used by both gRPC and ConnectRPC protocols.
 */
export const ConnectRpcStatus = {
  OK: 0,
  CANCELLED: 1,
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  DEADLINE_EXCEEDED: 4,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  PERMISSION_DENIED: 7,
  RESOURCE_EXHAUSTED: 8,
  FAILED_PRECONDITION: 9,
  ABORTED: 10,
  OUT_OF_RANGE: 11,
  UNIMPLEMENTED: 12,
  INTERNAL: 13,
  UNAVAILABLE: 14,
  DATA_LOSS: 15,
  UNAUTHENTICATED: 16,
} as const;

/**
 * ConnectRPC/gRPC status code type.
 * Derived from ConnectRpcStatus values.
 */
export type ConnectRpcStatusCode =
  (typeof ConnectRpcStatus)[keyof typeof ConnectRpcStatus];

// Reverse mapping: code -> name
const statusNames = Object.fromEntries(
  Object.entries(ConnectRpcStatus).map(([name, code]) => [code, name]),
) as Record<ConnectRpcStatusCode, string>;

// Set of valid status codes
const validCodes = new Set(Object.values(ConnectRpcStatus));

/**
 * Get the name of a ConnectRPC/gRPC status code.
 *
 * @example
 * ```typescript
 * getStatusName(0);  // "OK"
 * getStatusName(5);  // "NOT_FOUND"
 * getStatusName(16); // "UNAUTHENTICATED"
 * ```
 */
export function getStatusName(code: ConnectRpcStatusCode): string {
  return statusNames[code];
}

/**
 * Check if a number is a valid ConnectRPC/gRPC status code.
 *
 * @example
 * ```typescript
 * isConnectRpcStatusCode(0);   // true
 * isConnectRpcStatusCode(16);  // true
 * isConnectRpcStatusCode(99);  // false
 * ```
 */
export function isConnectRpcStatusCode(
  code: number,
): code is ConnectRpcStatusCode {
  return validCodes.has(code as ConnectRpcStatusCode);
}
