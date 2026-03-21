import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
import type { ErrorEnvelope } from "@lifecycle/contracts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function fallbackRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? "unknown";
}

export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    typeof value.requestId === "string" &&
    typeof value.retryable === "boolean" &&
    (value.details === undefined || isRecord(value.details)) &&
    (value.suggestedAction === undefined || typeof value.suggestedAction === "string")
  );
}

function parseErrorEnvelopeJson(value: string): ErrorEnvelope | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isErrorEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export class LifecycleInvokeError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly envelope: ErrorEnvelope;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly suggestedAction?: string;

  constructor(envelope: ErrorEnvelope) {
    super(envelope.message);
    this.name = "LifecycleInvokeError";
    this.code = envelope.code;
    this.details = envelope.details;
    this.envelope = envelope;
    this.requestId = envelope.requestId;
    this.retryable = envelope.retryable;
    this.suggestedAction = envelope.suggestedAction;
  }
}

export function getLifecycleErrorEnvelope(error: unknown): ErrorEnvelope | null {
  if (error instanceof LifecycleInvokeError) {
    return error.envelope;
  }

  if (isErrorEnvelope(error)) {
    return {
      code: error.code,
      details: error.details,
      message: error.message,
      requestId: error.requestId,
      retryable: error.retryable,
      suggestedAction: error.suggestedAction,
    };
  }

  if (typeof error === "string") {
    return parseErrorEnvelopeJson(error);
  }

  if (error instanceof Error) {
    return (
      parseErrorEnvelopeJson(error.message) ?? (isErrorEnvelope(error.cause) ? error.cause : null)
    );
  }

  return null;
}

export function getLifecycleErrorCode(error: unknown): string | null {
  return getLifecycleErrorEnvelope(error)?.code ?? null;
}

export function getLifecycleErrorMessage(error: unknown, fallback: string): string {
  const envelope = getLifecycleErrorEnvelope(error);
  if (envelope?.message.trim()) {
    return envelope.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

export function toErrorEnvelope(error: unknown): ErrorEnvelope {
  return (
    getLifecycleErrorEnvelope(error) ?? {
      code: "internal_error",
      message: getLifecycleErrorMessage(error, "Unexpected desktop error."),
      requestId: fallbackRequestId(),
      retryable: false,
    }
  );
}

export async function invokeTauri<T>(command: string, args?: InvokeArgs): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const envelope = getLifecycleErrorEnvelope(error);
    if (envelope) {
      throw new LifecycleInvokeError(envelope);
    }

    throw error;
  }
}
