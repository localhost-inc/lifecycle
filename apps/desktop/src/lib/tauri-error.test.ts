import { describe, expect, test } from "bun:test";
import {
  LifecycleClientError,
  LifecycleInvokeError,
  getLifecycleErrorCode,
  getLifecycleErrorEnvelope,
  getLifecycleErrorMessage,
  invokeLifecycle,
  invokeTauri,
  toErrorEnvelope,
} from "./tauri-error";

const envelope = {
  code: "workspace_mutation_locked",
  message: "Workspace mutation locked while environment status is 'stopping'",
  details: { status: "stopping" },
  requestId: "request-123",
  retryable: true,
  suggestedAction: "Wait for the current workspace lifecycle action to finish and try again.",
} as const;

describe("tauri-error helpers", () => {
  test("extract envelope details from lifecycle invoke errors", () => {
    const error = new LifecycleInvokeError(envelope);

    expect(getLifecycleErrorEnvelope(error)).toEqual(envelope);
    expect(getLifecycleErrorCode(error)).toBe("workspace_mutation_locked");
    expect(getLifecycleErrorMessage(error, "fallback")).toBe(envelope.message);
  });

  test("parses stringified envelopes from generic errors", () => {
    const error = new Error(JSON.stringify(envelope));

    expect(getLifecycleErrorEnvelope(error)).toEqual(envelope);
    expect(getLifecycleErrorCode(error)).toBe("workspace_mutation_locked");
  });

  test("falls back to plain error messaging when no envelope is present", () => {
    const error = new Error("plain failure");

    expect(getLifecycleErrorEnvelope(error)).toBeNull();
    expect(getLifecycleErrorCode(error)).toBeNull();
    expect(getLifecycleErrorMessage(error, "fallback")).toBe("plain failure");
  });

  test("normalizes object envelopes serialized from tauri", () => {
    const error = {
      code: "validation_failed",
      details: { field: "port_override" },
      message: "Invalid port_override: must be between 1 and 65535",
      request_id: "request-456",
      retryable: false,
      suggested_action: "Correct the invalid input and retry.",
    };

    expect(getLifecycleErrorEnvelope(error)).toEqual({
      code: "validation_failed",
      details: { field: "port_override" },
      message: "Invalid port_override: must be between 1 and 65535",
      requestId: "request-456",
      retryable: false,
      suggestedAction: "Correct the invalid input and retry.",
    });
  });

  test("exposes compatibility aliases for invoke helpers and error types", () => {
    expect(LifecycleClientError).toBe(LifecycleInvokeError);
    expect(invokeLifecycle).toBe(invokeTauri);
    expect(
      toErrorEnvelope({
        code: "not_found",
        message: "Workspace not found: ws_1",
        requestId: "request-789",
        retryable: false,
      }),
    ).toEqual({
      code: "not_found",
      message: "Workspace not found: ws_1",
      requestId: "request-789",
      retryable: false,
    });
  });
});
