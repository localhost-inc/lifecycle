export interface RetryOptions {
  /** Maximum number of attempts (including the first). Defaults to 3. */
  attempts?: number;
  /** Called before each retry with the error and attempt number (1-indexed). Awaited if it returns a promise. */
  onRetry?: (error: unknown, attempt: number) => void | Promise<void>;
}

export async function retry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const maxAttempts = options?.attempts ?? 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await options?.onRetry?.(error, attempt);
      }
    }
  }

  throw lastError;
}
