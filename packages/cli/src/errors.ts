export class BridgeClientError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;
  readonly suggestedAction?: string;

  constructor(input: {
    code: string;
    details?: Record<string, unknown> | undefined;
    message: string;
    retryable?: boolean;
    suggestedAction?: string | undefined;
  }) {
    super(input.message);
    this.name = "BridgeClientError";
    this.code = input.code;
    this.retryable = input.retryable ?? false;
    if (input.details !== undefined) {
      this.details = input.details;
    }
    if (input.suggestedAction !== undefined) {
      this.suggestedAction = input.suggestedAction;
    }
  }
}
