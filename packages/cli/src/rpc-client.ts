import { hc } from "hono/client";
import type { AppType } from "@lifecycle/api/src/worker";
import { readCredentials } from "./credentials";
import { BridgeClientError } from "./errors";

const DEFAULT_API_URL = "https://api.lifecycle.dev";

function getApiUrl(): string {
  return process.env.LIFECYCLE_API_URL ?? DEFAULT_API_URL;
}

function createFetch(opts?: { requireAuth?: boolean }) {
  return async (input: any, init?: any): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (opts?.requireAuth !== false) {
      const creds = await readCredentials();
      if (!creds) {
        throw new BridgeClientError({
          code: "unauthenticated",
          message: "Not signed in.",
          suggestedAction: "Run `lifecycle auth login` to sign in.",
        });
      }
      headers.set("Authorization", `Bearer ${creds.token}`);
    }
    const res = await fetch(input, { ...init, headers });
    if (!res.ok) {
      const data = (await res.json()) as { error?: Record<string, unknown> };
      const error = data.error;
      throw new BridgeClientError({
        code: (error?.code as string) ?? "internal_error",
        message: (error?.message as string) ?? `API error ${res.status}`,
        details: error?.details as Record<string, unknown> | undefined,
        suggestedAction: error?.suggestedAction as string | undefined,
        retryable: (error?.retryable as boolean) ?? false,
      });
    }
    return res;
  };
}

export function createClient(opts?: { requireAuth?: boolean }) {
  return hc<AppType>(getApiUrl(), { fetch: createFetch(opts) as typeof fetch });
}
