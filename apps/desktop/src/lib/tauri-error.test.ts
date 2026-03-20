import { describe, expect, test } from "bun:test";
import {
  LifecycleInvokeError,
  getLifecycleErrorCode,
  getLifecycleErrorEnvelope,
  getLifecycleErrorMessage,
  toErrorEnvelope,
} from "@/lib/tauri-error";

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

  test("normalizes object envelopes from tauri", () => {
    const error = {
      code: "validation_failed",
      details: { field: "workspace_name" },
      message: "Invalid workspace_name: must not be empty",
      requestId: "request-456",
      retryable: false,
      suggestedAction: "Correct the invalid input and retry.",
    };

    expect(getLifecycleErrorEnvelope(error)).toEqual({
      code: "validation_failed",
      details: { field: "workspace_name" },
      message: "Invalid workspace_name: must not be empty",
      requestId: "request-456",
      retryable: false,
      suggestedAction: "Correct the invalid input and retry.",
    });
  });

  test("toErrorEnvelope passes through valid envelopes", () => {
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
