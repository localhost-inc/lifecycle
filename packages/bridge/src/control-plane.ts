import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { hc, type ClientResponse } from "hono/client";
import type { AppType } from "@lifecycle/control-plane/rpc";
import { resolveControlPlaneUrl } from "./control-plane-url";

const CREDENTIALS_PATH = join(homedir(), ".lifecycle", "credentials.json");

interface StoredCredentials {
  token: string;
  activeOrgId: string | null;
}

function readCredentials(): StoredCredentials | null {
  try {
    const text = readFileSync(CREDENTIALS_PATH, "utf8");
    return JSON.parse(text) as StoredCredentials;
  } catch {
    return null;
  }
}

export function createControlPlaneClient() {
  const baseUrl = resolveControlPlaneUrl();

  return hc<AppType>(baseUrl, {
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const credentials = readCredentials();
      if (!credentials?.token) {
        throw new Error("Not signed in. Run `lifecycle auth login` first.");
      }

      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${credentials.token}`);
      return fetch(input, { ...init, headers });
    },
  });
}

type JsonResponseLike<T> = Pick<Response, "ok" | "status"> & {
  json(): Promise<T>;
};

export async function readControlPlaneJson<T>(
  response: ClientResponse<T, any, any> | JsonResponseLike<T>,
): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | T
    | { error?: { message?: string } }
    | null;

  if (response.ok) {
    return payload as T;
  }

  const message =
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
      ? payload.error.message
      : `API error ${response.status}`;

  throw new Error(message);
}

export async function requireActiveOrganizationId(explicitOrganizationId?: string): Promise<string> {
  if (explicitOrganizationId) {
    return explicitOrganizationId;
  }

  const credentials = readCredentials();
  if (!credentials) {
    throw new Error("Not signed in. Run `lifecycle auth login` first.");
  }
  if (!credentials.activeOrgId) {
    throw new Error("No active organization. Run `lifecycle org switch <name>`.");
  }

  return credentials.activeOrgId;
}
