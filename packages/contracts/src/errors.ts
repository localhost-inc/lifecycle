export interface ErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
  suggestedAction?: string;
  retryable: boolean;
}
