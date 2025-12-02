import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import protobuf from "protobufjs";
import { Buffer } from "node:buffer";
import descriptor from "protobufjs-descriptor";
import { config } from "./config.ts";

type FileDescriptorObject = ReturnType<
  typeof descriptor.FileDescriptorProto.toObject
>;

/**
 * Supported gRPC Server Reflection versions.
 */
export type ReflectionVersion = "v1" | "v1alpha";

const REFLECTION_PACKAGES: Record<ReflectionVersion, string> = {
  v1: "grpc.reflection.v1",
  v1alpha: "grpc.reflection.v1alpha",
};

interface ReflectionRequest {
  readonly host?: string;
  readonly file_by_filename?: string;
  readonly file_containing_symbol?: string;
  readonly file_containing_extension?: {
    readonly containing_type?: string;
    readonly extension_number?: number;
  };
  readonly all_extension_numbers_of_type?: string;
  readonly list_services?: string;
}

interface ReflectionResponse {
  readonly file_descriptor_response?: {
    readonly file_descriptor_proto?: Uint8Array[];
  };
  readonly error_response?: {
    readonly error_code?: number;
    readonly error_message?: string;
  };
}

type ReflectionClient = grpc.Client & {
  serverReflectionInfo(): grpc.ClientDuplexStream<
    ReflectionRequest,
    ReflectionResponse
  >;
};

/**
 * Load reflection proto file using fetch and parse with protobufjs.
 */
async function loadReflectionProto(
  version: ReflectionVersion,
): Promise<protobuf.Root> {
  const protoUrl = new URL(
    `./proto/grpc/reflection/${version}/reflection.proto`,
    import.meta.url,
  );
  const response = await fetch(protoUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to load reflection proto: ${response.status} ${response.statusText}`,
    );
  }
  const protoContent = await response.text();
  return protobuf.parse(protoContent, { keepCase: true }).root;
}

/**
 * Create serializer/deserializer functions for a specific reflection version.
 */
function createSerializers(root: protobuf.Root, version: ReflectionVersion) {
  const pkg = REFLECTION_PACKAGES[version];
  const ServerReflectionRequest = root.lookupType(
    `${pkg}.ServerReflectionRequest`,
  );
  const ServerReflectionResponse = root.lookupType(
    `${pkg}.ServerReflectionResponse`,
  );

  function serializeRequest(message: ReflectionRequest): Buffer {
    const err = ServerReflectionRequest.verify(message);
    if (err) {
      throw new Error(`Invalid reflection request: ${err}`);
    }
    const msg = ServerReflectionRequest.create(message);
    return Buffer.from(ServerReflectionRequest.encode(msg).finish());
  }

  function deserializeRequest(bytes: Buffer): ReflectionRequest {
    const msg = ServerReflectionRequest.decode(bytes);
    return msg as unknown as ReflectionRequest;
  }

  function serializeResponse(message: ReflectionResponse): Buffer {
    const err = ServerReflectionResponse.verify(message);
    if (err) {
      throw new Error(`Invalid reflection response: ${err}`);
    }
    const msg = ServerReflectionResponse.create(message);
    return Buffer.from(ServerReflectionResponse.encode(msg).finish());
  }

  function deserializeResponse(bytes: Buffer): ReflectionResponse {
    const msg = ServerReflectionResponse.decode(bytes);
    return msg as unknown as ReflectionResponse;
  }

  return {
    serializeRequest,
    deserializeRequest,
    serializeResponse,
    deserializeResponse,
  };
}

/**
 * Create gRPC service definition for reflection.
 */
function createServiceDefinition(
  version: ReflectionVersion,
  serializers: ReturnType<typeof createSerializers>,
): grpc.ServiceDefinition {
  const pkg = REFLECTION_PACKAGES[version];
  return {
    serverReflectionInfo: {
      path: `/${pkg}.ServerReflection/ServerReflectionInfo`,
      requestStream: true,
      responseStream: true,
      requestSerialize: serializers.serializeRequest,
      requestDeserialize: serializers.deserializeRequest,
      responseSerialize: serializers.serializeResponse,
      responseDeserialize: serializers.deserializeResponse,
      originalName: "ServerReflectionInfo",
    },
  };
}

/**
 * Create reflection client constructor for a specific version.
 */
function createReflectionClientCtor(
  serviceDefinition: grpc.ServiceDefinition,
): new (
  address: string,
  credentials: grpc.ChannelCredentials,
  options?: grpc.ClientOptions,
) => ReflectionClient {
  return grpc.makeGenericClientConstructor(
    serviceDefinition,
    "ServerReflection",
  ) as unknown as new (
    address: string,
    credentials: grpc.ChannelCredentials,
    options?: grpc.ClientOptions,
  ) => ReflectionClient;
}

export class ReflectedDescriptor {
  readonly #descriptors: Uint8Array[];

  constructor(descriptors: Uint8Array[]) {
    this.#descriptors = descriptors;
  }

  getPackageDefinition(
    options?: protoLoader.Options,
  ): protoLoader.PackageDefinition {
    const files: FileDescriptorObject[] = this.#descriptors.map((bytes) => {
      const message = descriptor.FileDescriptorProto.decode(bytes);
      return descriptor.FileDescriptorProto.toObject(message, {
        defaults: false,
      });
    });
    if (config.debugReflection) {
      console.debug(
        "Reflection file descriptors:",
        files.map((file) => ({
          name: file.name,
          package: file.package,
          messages: file.messageType?.map((
            message: descriptor.IDescriptorProto,
          ) => message.name),
          services: file.service?.map((
            service: descriptor.IServiceDescriptorProto,
          ) => service.name),
          dependencies: file.dependency,
        })),
      );
    }
    return protoLoader.loadFileDescriptorSetFromObject(
      { file: files },
      options,
    );
  }
}

/**
 * Options for creating a GrpcReflectionClient.
 */
export interface GrpcReflectionClientOptions {
  /**
   * Preferred reflection version to try first.
   * If not specified, defaults to "v1" and falls back to "v1alpha".
   */
  readonly preferredVersion?: ReflectionVersion;
}

/**
 * gRPC Server Reflection client that supports both v1 and v1alpha versions.
 *
 * By default, it tries v1 first and falls back to v1alpha if the server
 * returns UNIMPLEMENTED.
 */
export class GrpcReflectionClient implements AsyncDisposable {
  readonly #address: string;
  readonly #credentials: grpc.ChannelCredentials;
  readonly #options?: grpc.ClientOptions;
  readonly #preferredVersion: ReflectionVersion;
  readonly #descriptorCache: Map<string, Uint8Array> = new Map();

  #client?: ReflectionClient;
  #activeVersion?: ReflectionVersion;
  #initPromise?: Promise<void>;

  constructor(
    address: string,
    credentials: grpc.ChannelCredentials,
    options?: grpc.ClientOptions,
    reflectionOptions?: GrpcReflectionClientOptions,
  ) {
    this.#address = address;
    this.#credentials = credentials;
    this.#options = options;
    this.#preferredVersion = reflectionOptions?.preferredVersion ?? "v1";
  }

  /**
   * The active reflection version being used.
   * Only available after the first successful request.
   */
  get activeVersion(): ReflectionVersion | undefined {
    return this.#activeVersion;
  }

  async #ensureClient(): Promise<ReflectionClient> {
    if (this.#client) {
      return this.#client;
    }

    // Prevent concurrent initialization
    if (this.#initPromise) {
      await this.#initPromise;
      return this.#client!;
    }

    this.#initPromise = this.#initializeClient();
    await this.#initPromise;
    return this.#client!;
  }

  async #initializeClient(): Promise<void> {
    const versions: ReflectionVersion[] = this.#preferredVersion === "v1"
      ? ["v1", "v1alpha"]
      : ["v1alpha", "v1"];

    let lastError: Error | undefined;

    for (const version of versions) {
      let client: ReflectionClient | undefined;
      try {
        const root = await loadReflectionProto(version);
        const serializers = createSerializers(root, version);
        const serviceDefinition = createServiceDefinition(version, serializers);
        const ClientCtor = createReflectionClientCtor(serviceDefinition);
        client = new ClientCtor(
          this.#address,
          this.#credentials,
          this.#options,
        );

        // Test the connection with a simple list_services request
        await this.#testConnection(client, version);

        this.#client = client;
        this.#activeVersion = version;

        if (config.debugReflection) {
          console.debug(`Using reflection version: ${version}`);
        }
        return;
      } catch (error) {
        // Close the client if it was created but failed
        if (client) {
          client.close();
        }

        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if this is UNIMPLEMENTED error - try next version
        if (this.#isUnimplementedError(error)) {
          if (config.debugReflection) {
            console.debug(
              `Reflection ${version} not implemented, trying next version`,
            );
          }
          continue;
        }

        // For other errors, throw immediately
        throw error;
      }
    }

    throw lastError ?? new Error("Failed to initialize reflection client");
  }

  #isUnimplementedError(error: unknown): boolean {
    if (error instanceof Error) {
      const grpcError = error as { code?: number };
      // grpc.status.UNIMPLEMENTED = 12
      return grpcError.code === 12;
    }
    return false;
  }

  #testConnection(
    client: ReflectionClient,
    _version: ReflectionVersion,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const stream = client.serverReflectionInfo();
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          stream.cancel();
          reject(new Error("Reflection connection test timed out"));
        }
      }, 5000);

      stream.on("data", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          stream.cancel();
          resolve();
        }
      });

      stream.on("error", (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      });

      stream.on("end", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve();
        }
      });

      // Send a simple list_services request to test the connection
      stream.write({ list_services: "" });
      stream.end();
    });
  }

  async getDescriptorBySymbol(symbol: string): Promise<ReflectedDescriptor> {
    const descriptors = await this.#requestDescriptor({
      file_containing_symbol: symbol,
    });
    if (!descriptors.length) {
      throw new Error(`No descriptor returned for symbol: ${symbol}`);
    }
    const allDescriptors = await this.#collectDescriptors(descriptors);
    return new ReflectedDescriptor(allDescriptors);
  }

  #addDescriptors(descriptors: Uint8Array[]): string[] {
    const newDependencies: string[] = [];
    for (const bytes of descriptors) {
      const file = descriptor.FileDescriptorProto.decode(bytes);
      const fileObject = descriptor.FileDescriptorProto.toObject(file, {
        defaults: false,
      });
      const name = fileObject.name;
      if (!name || this.#descriptorCache.has(name)) {
        continue;
      }
      this.#descriptorCache.set(name, bytes);
      if (fileObject.dependency) {
        for (const dep of fileObject.dependency) {
          if (dep && !this.#descriptorCache.has(dep)) {
            newDependencies.push(dep);
          }
        }
      }
    }
    return newDependencies;
  }

  async #collectDescriptors(initial: Uint8Array[]): Promise<Uint8Array[]> {
    const queue = this.#addDescriptors(initial);

    while (queue.length > 0) {
      const dep = queue.shift();
      if (!dep || this.#descriptorCache.has(dep)) {
        continue;
      }
      const depDescriptors = await this.#requestDescriptor({
        file_by_filename: dep,
      });
      queue.push(...this.#addDescriptors(depDescriptors));
    }

    return [...this.#descriptorCache.values()];
  }

  async #requestDescriptor(request: ReflectionRequest): Promise<Uint8Array[]> {
    const client = await this.#ensureClient();

    return new Promise((resolve, reject) => {
      const stream = client.serverReflectionInfo();
      let settled = false;

      stream.on("data", (response: ReflectionResponse) => {
        if (settled) return;

        if (
          response.file_descriptor_response?.file_descriptor_proto &&
          response.file_descriptor_response.file_descriptor_proto.length > 0
        ) {
          settled = true;
          const descriptors = response.file_descriptor_response
            .file_descriptor_proto.map((proto) =>
              proto instanceof Uint8Array ? proto : new Uint8Array(proto)
            );
          if (config.debugReflection) {
            const files = descriptors.map((bytes) => {
              const message = descriptor.FileDescriptorProto.decode(bytes);
              return descriptor.FileDescriptorProto.toObject(message, {
                defaults: false,
              });
            });
            console.debug(
              "Reflected descriptors:",
              files.map((file) => file.name),
            );
          }
          resolve(descriptors);
          stream.cancel();
          return;
        }

        if (response.error_response) {
          settled = true;
          const code = response.error_response.error_code ??
            grpc.status.UNKNOWN;
          const message = response.error_response.error_message ??
            "Unknown reflection error";
          reject(new Error(`Reflection error (${code}): ${message}`));
          stream.cancel();
        }
      });

      stream.on("error", (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });

      stream.on("end", () => {
        if (settled) return;
        settled = true;
        reject(new Error("Reflection response ended without data"));
      });

      stream.write(request);
      stream.end();
    });
  }

  close(): Promise<void> {
    if (this.#client) {
      this.#client.close();
      this.#client = undefined;
    }
    return Promise.resolve();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
