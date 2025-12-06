/**
 * Common types for ConnectRPC client.
 *
 * @module
 */

import type { MessageShape } from "@bufbuild/protobuf";
import type { FileDescriptorSetSchema } from "@bufbuild/protobuf/wkt";
import type { CommonOptions } from "@probitas/client";

/**
 * FileDescriptorSet message type from @bufbuild/protobuf.
 * This is the decoded protobuf message containing file descriptors.
 */
export type FileDescriptorSet = MessageShape<typeof FileDescriptorSetSchema>;

/**
 * Protocol to use for ConnectRPC transport.
 */
export type ConnectProtocol = "connect" | "grpc" | "grpc-web";

/**
 * HTTP version for transport.
 */
export type HttpVersion = "1.1" | "2";

/**
 * TLS configuration for ConnectRPC connections.
 */
export interface TlsConfig {
  /** Root CA certificate (PEM format). */
  readonly rootCerts?: Uint8Array;
  /** Client certificate (PEM format). */
  readonly clientCert?: Uint8Array;
  /** Client private key (PEM format). */
  readonly clientKey?: Uint8Array;
  /** Skip server certificate verification (use only for testing). */
  readonly insecure?: boolean;
}

/**
 * Configuration for creating a ConnectRPC client.
 */
export interface ConnectRpcClientConfig extends CommonOptions {
  /** Server address (host:port or full URL). */
  readonly address: string;

  /**
   * Protocol to use.
   * @default "grpc"
   */
  readonly protocol?: ConnectProtocol;

  /**
   * HTTP version to use.
   * @default "2"
   */
  readonly httpVersion?: HttpVersion;

  /** TLS configuration. If not provided, uses insecure credentials. */
  readonly tls?: TlsConfig;

  /** Default metadata to send with every request. */
  readonly metadata?: Record<string, string>;

  /**
   * Schema resolution configuration.
   * - "reflection": Use Server Reflection to discover services dynamically (default)
   * - string: Path to FileDescriptorSet binary file (from `buf build --output set.binpb`)
   * - Uint8Array: FileDescriptorSet binary data
   * - FileDescriptorSet: Pre-parsed FileDescriptorSet message object
   * @default "reflection"
   */
  readonly schema?: "reflection" | string | Uint8Array | FileDescriptorSet;

  /**
   * Whether to use binary format for messages.
   * @default true
   */
  readonly useBinaryFormat?: boolean;

  /**
   * Whether to throw ConnectRpcError on non-OK responses (code !== 0).
   * Can be overridden per-request via ConnectRpcOptions.throwOnError.
   * @default true
   */
  readonly throwOnError?: boolean;
}

/**
 * Options for individual ConnectRPC calls.
 */
export interface ConnectRpcOptions extends CommonOptions {
  /** Metadata to send with the request. */
  readonly metadata?: Record<string, string>;

  /**
   * Whether to throw ConnectRpcError on non-OK responses (code !== 0).
   * Overrides ConnectRpcClientConfig.throwOnError.
   * @default true (when not specified in client config)
   */
  readonly throwOnError?: boolean;
}

/**
 * Service information from reflection.
 */
export interface ServiceInfo {
  /** Fully qualified service name (e.g., "echo.EchoService") */
  readonly name: string;
  /** Proto file name */
  readonly file: string;
}

/**
 * Method information from reflection.
 */
export interface MethodInfo {
  /** Method name (e.g., "Echo") */
  readonly name: string;
  /** Local name (camelCase) */
  readonly localName: string;
  /** Method kind */
  readonly kind:
    | "unary"
    | "server_streaming"
    | "client_streaming"
    | "bidi_streaming";
  /** Input message type name */
  readonly inputType: string;
  /** Output message type name */
  readonly outputType: string;
  /** Whether the method is idempotent */
  readonly idempotent: boolean;
}

/**
 * Detailed service information.
 */
export interface ServiceDetail {
  /** Service name */
  readonly name: string;
  /** Fully qualified service name */
  readonly fullName: string;
  /** Package name */
  readonly packageName: string;
  /** Proto file name */
  readonly protoFile: string;
  /** All methods */
  readonly methods: readonly MethodInfo[];
}
