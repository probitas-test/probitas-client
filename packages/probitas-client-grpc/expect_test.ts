import { assertThrows } from "@std/assert";
import { expectGrpcResponse } from "./expect.ts";
import { GrpcResponseImpl } from "./response.ts";
import { GrpcStatus } from "./status.ts";

function createResponse(
  overrides: Partial<ConstructorParameters<typeof GrpcResponseImpl>[0]> = {},
) {
  return new GrpcResponseImpl({
    code: GrpcStatus.OK,
    message: "",
    body: null,
    trailers: {},
    duration: 100,
    ...overrides,
  });
}

Deno.test("expectGrpcResponse", async (t) => {
  await t.step("ok()", async (t) => {
    await t.step("passes when code is 0", () => {
      const response = createResponse({ code: GrpcStatus.OK });
      expectGrpcResponse(response).ok();
    });

    await t.step("fails when code is not 0", () => {
      const response = createResponse({ code: GrpcStatus.NOT_FOUND });
      assertThrows(
        () => expectGrpcResponse(response).ok(),
        Error,
        "Expected ok response (code 0), got code 5",
      );
    });
  });

  await t.step("notOk()", async (t) => {
    await t.step("passes when code is not 0", () => {
      const response = createResponse({ code: GrpcStatus.INTERNAL });
      expectGrpcResponse(response).notOk();
    });

    await t.step("fails when code is 0", () => {
      const response = createResponse({ code: GrpcStatus.OK });
      assertThrows(
        () => expectGrpcResponse(response).notOk(),
        Error,
        "Expected non-ok response, got code 0",
      );
    });
  });

  await t.step("code()", async (t) => {
    await t.step("passes when code matches", () => {
      const response = createResponse({ code: GrpcStatus.NOT_FOUND });
      expectGrpcResponse(response).code(GrpcStatus.NOT_FOUND);
    });

    await t.step("fails when code does not match", () => {
      const response = createResponse({ code: GrpcStatus.INTERNAL });
      assertThrows(
        () => expectGrpcResponse(response).code(GrpcStatus.NOT_FOUND),
        Error,
        "Expected code 5, got 13",
      );
    });
  });

  await t.step("codeIn()", async (t) => {
    await t.step("passes when code is in list", () => {
      const response = createResponse({ code: GrpcStatus.NOT_FOUND });
      expectGrpcResponse(response).codeIn(
        GrpcStatus.NOT_FOUND,
        GrpcStatus.INTERNAL,
      );
    });

    await t.step("fails when code is not in list", () => {
      const response = createResponse({ code: GrpcStatus.UNAVAILABLE });
      assertThrows(
        () =>
          expectGrpcResponse(response).codeIn(
            GrpcStatus.NOT_FOUND,
            GrpcStatus.INTERNAL,
          ),
        Error,
        "Expected code to be one of [5, 13], got 14",
      );
    });
  });

  await t.step("message()", async (t) => {
    await t.step("passes when message matches string", () => {
      const response = createResponse({ message: "resource not found" });
      expectGrpcResponse(response).message("resource not found");
    });

    await t.step("passes when message matches regex", () => {
      const response = createResponse({ message: "resource not found" });
      expectGrpcResponse(response).message(/not found/);
    });

    await t.step("fails when message does not match", () => {
      const response = createResponse({ message: "internal error" });
      assertThrows(
        () => expectGrpcResponse(response).message("not found"),
        Error,
        'Expected message "not found", got "internal error"',
      );
    });
  });

  await t.step("messageContains()", async (t) => {
    await t.step("passes when message contains substring", () => {
      const response = createResponse({ message: "resource not found" });
      expectGrpcResponse(response).messageContains("not found");
    });

    await t.step("fails when message does not contain substring", () => {
      const response = createResponse({ message: "internal error" });
      assertThrows(
        () => expectGrpcResponse(response).messageContains("not found"),
        Error,
        'Expected message to contain "not found"',
      );
    });
  });

  await t.step("messageMatch()", async (t) => {
    await t.step("passes when matcher does not throw", () => {
      const response = createResponse({ message: "error: code 123" });
      expectGrpcResponse(response).messageMatch((msg) => {
        if (!msg.includes("123")) {
          throw new Error("expected code");
        }
      });
    });

    await t.step("fails when matcher throws", () => {
      const response = createResponse({ message: "error" });
      assertThrows(
        () =>
          expectGrpcResponse(response).messageMatch(() => {
            throw new Error("custom error");
          }),
        Error,
        "custom error",
      );
    });
  });

  await t.step("trailers()", async (t) => {
    await t.step("passes when trailer matches string", () => {
      const response = createResponse({
        trailers: { "request-id": "abc123" },
      });
      expectGrpcResponse(response).trailers("request-id", "abc123");
    });

    await t.step("passes when trailer matches regex", () => {
      const response = createResponse({
        trailers: { "request-id": "abc123" },
      });
      expectGrpcResponse(response).trailers("request-id", /^abc/);
    });

    await t.step("fails when trailer does not match", () => {
      const response = createResponse({
        trailers: { "request-id": "xyz" },
      });
      assertThrows(
        () => expectGrpcResponse(response).trailers("request-id", "abc123"),
        Error,
        'Expected trailer "request-id" to be "abc123", got "xyz"',
      );
    });
  });

  await t.step("trailersExist()", async (t) => {
    await t.step("passes when trailer key exists", () => {
      const response = createResponse({
        trailers: { "request-id": "abc" },
      });
      expectGrpcResponse(response).trailersExist("request-id");
    });

    await t.step("fails when trailer key does not exist", () => {
      const response = createResponse({ trailers: {} });
      assertThrows(
        () => expectGrpcResponse(response).trailersExist("request-id"),
        Error,
        'Expected trailer "request-id" to exist',
      );
    });
  });

  await t.step("noContent()", async (t) => {
    await t.step("passes when body is null", () => {
      const response = createResponse({ body: null });
      expectGrpcResponse(response).noContent();
    });

    await t.step("fails when body is not null", () => {
      const response = createResponse({ body: new Uint8Array([1, 2, 3]) });
      assertThrows(
        () => expectGrpcResponse(response).noContent(),
        Error,
        "Expected no content, but body has 3 bytes",
      );
    });
  });

  await t.step("hasContent()", async (t) => {
    await t.step("passes when body is not null", () => {
      const response = createResponse({ body: new Uint8Array([1]) });
      expectGrpcResponse(response).hasContent();
    });

    await t.step("fails when body is null", () => {
      const response = createResponse({ body: null });
      assertThrows(
        () => expectGrpcResponse(response).hasContent(),
        Error,
        "Expected content, but body is null",
      );
    });
  });

  await t.step("bodyContains()", async (t) => {
    await t.step("passes when body contains subbody", () => {
      const response = createResponse({
        body: new Uint8Array([1, 2, 3, 4, 5]),
      });
      expectGrpcResponse(response).bodyContains(new Uint8Array([2, 3, 4]));
    });

    await t.step("fails when body does not contain subbody", () => {
      const response = createResponse({
        body: new Uint8Array([1, 2, 3]),
      });
      assertThrows(
        () => expectGrpcResponse(response).bodyContains(new Uint8Array([4, 5])),
        Error,
        "Expected body to contain specified bytes",
      );
    });
  });

  await t.step("bodyMatch()", async (t) => {
    await t.step("passes when matcher does not throw", () => {
      const response = createResponse({
        body: new Uint8Array([1, 2, 3]),
      });
      expectGrpcResponse(response).bodyMatch((body) => {
        if (body.length !== 3) throw new Error("wrong length");
      });
    });
  });

  await t.step("jsonContains()", async (t) => {
    await t.step("passes when json contains subset", () => {
      const body = new TextEncoder().encode('{"name":"test","value":42}');
      const response = createResponse({ body });
      expectGrpcResponse(response).jsonContains({ name: "test" });
    });

    await t.step("fails when json does not contain subset", () => {
      const body = new TextEncoder().encode('{"name":"test"}');
      const response = createResponse({ body });
      assertThrows(
        () => expectGrpcResponse(response).jsonContains({ value: 42 }),
        Error,
        "Expected JSON to contain",
      );
    });
  });

  await t.step("jsonMatch()", async (t) => {
    await t.step("passes when matcher does not throw", () => {
      const body = new TextEncoder().encode('{"count":5}');
      const response = createResponse({ body });
      expectGrpcResponse(response).jsonMatch<{ count: number }>((data) => {
        if (data.count !== 5) throw new Error("wrong count");
      });
    });
  });

  await t.step("durationLessThan()", async (t) => {
    await t.step("passes when duration is less than threshold", () => {
      const response = createResponse({ duration: 50 });
      expectGrpcResponse(response).durationLessThan(100);
    });

    await t.step("fails when duration is greater than threshold", () => {
      const response = createResponse({ duration: 150 });
      assertThrows(
        () => expectGrpcResponse(response).durationLessThan(100),
        Error,
        "Expected duration < 100ms, got 150ms",
      );
    });
  });

  await t.step("chaining", () => {
    const body = new TextEncoder().encode('{"status":"ok"}');
    const response = createResponse({
      code: GrpcStatus.OK,
      message: "success",
      body,
      trailers: { "x-trace-id": "trace123" },
      duration: 50,
    });

    expectGrpcResponse(response)
      .ok()
      .message("success")
      .trailersExist("x-trace-id")
      .hasContent()
      .jsonContains({ status: "ok" })
      .durationLessThan(100);
  });
});
