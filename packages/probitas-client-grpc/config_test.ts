import { assertEquals, assertExists } from "@std/assert";
import { config, ENV_VARS } from "./config.ts";

Deno.test("ENV_VARS", async (t) => {
  await t.step("DEBUG_REFLECTION has correct environment variable name", () => {
    assertEquals(ENV_VARS.DEBUG_REFLECTION, "PROBITAS_DEBUG_REFLECTION");
  });

  await t.step("is readonly object", () => {
    assertExists(ENV_VARS);
    assertEquals(typeof ENV_VARS, "object");
  });
});

Deno.test("config", async (t) => {
  await t.step("debugReflection is a boolean", () => {
    assertEquals(typeof config.debugReflection, "boolean");
  });

  await t.step("is readonly object", () => {
    assertExists(config);
    assertEquals(typeof config, "object");
  });
});
