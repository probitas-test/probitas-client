/**
 * Configuration loaded from environment variables.
 *
 * This module centralizes all environment variable access for the gRPC client package.
 * Environment variables are read once at module load time.
 */

/**
 * Environment variable names used by this package.
 */
export const ENV_VARS = {
  /**
   * Enable debug logging for reflection operations.
   * Set to "1" to enable.
   */
  DEBUG_REFLECTION: "PROBITAS_DEBUG_REFLECTION",
} as const;

/**
 * Configuration values derived from environment variables.
 */
export const config = {
  /**
   * Whether debug logging for reflection is enabled.
   */
  debugReflection: Deno.env.get(ENV_VARS.DEBUG_REFLECTION) === "1",
} as const;
