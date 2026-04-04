import { hc } from "hono/client";
import { resolveControlPlaneUrl } from "@lifecycle/bridge";
import type { AppType } from "@lifecycle/control-plane/rpc";
import { readCredentials } from "./credentials";
import { LifecycleCliError } from "./errors";

function createFetch(opts?: { requireAuth?: boolean }) {
  return async (input: any, init?: any): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (opts?.requireAuth !== false) {
      const creds = await readCredentials();
      if (!creds) {
        throw new LifecycleCliError({
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
      throw new LifecycleCliError({
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

export function createControlPlaneClient(opts?: { requireAuth?: boolean }) {
  return hc<AppType>(resolveControlPlaneUrl(), { fetch: createFetch(opts) as typeof fetch });
}
