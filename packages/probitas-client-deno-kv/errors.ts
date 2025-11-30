import { ClientError } from "@probitas/client";

/**
 * Base error class for Deno KV operations.
 */
export class DenoKvError extends ClientError {
  override readonly name: string = "DenoKvError";

  constructor(message: string, kind: string = "kv", options?: ErrorOptions) {
    super(message, kind, options);
  }
}

/**
 * Error thrown when an atomic operation fails due to check failures.
 */
export class DenoKvAtomicCheckError extends DenoKvError {
  override readonly name = "DenoKvAtomicCheckError";
  override readonly kind = "atomic_check" as const;

  /**
   * The keys whose checks failed.
   */
  readonly failedChecks: readonly Deno.KvKey[];

  constructor(
    message: string,
    failedChecks: readonly Deno.KvKey[],
    options?: ErrorOptions,
  ) {
    super(message, "atomic_check", options);
    this.failedChecks = failedChecks;
  }
}

/**
 * Error thrown when a quota limit is exceeded.
 */
export class DenoKvQuotaError extends DenoKvError {
  override readonly name = "DenoKvQuotaError";
  override readonly kind = "quota" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, "quota", options);
  }
}
