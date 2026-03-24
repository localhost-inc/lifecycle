import { useSyncExternalStore } from "react";
import type { AgentSessionProviderId } from "@lifecycle/contracts";
import type { ProviderAuthEvent, ProviderAuthStatus } from "@lifecycle/agents";
import { Command } from "@tauri-apps/plugin-shell";

interface ProviderAuthState {
  claude: ProviderAuthStatus;
  codex: ProviderAuthStatus;
}

const NOT_CHECKED: ProviderAuthStatus = { state: "not_checked" };

let state: ProviderAuthState = {
  claude: NOT_CHECKED,
  codex: NOT_CHECKED,
};

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setProviderStatus(provider: AgentSessionProviderId, status: ProviderAuthStatus): void {
  state = { ...state, [provider]: status };
  notify();
}

function statusFromResultEvent(
  event: Extract<ProviderAuthEvent, { kind: "auth.result" }>,
): ProviderAuthStatus {
  switch (event.state) {
    case "authenticated":
      return {
        state: "authenticated",
        email: event.email ?? null,
        organization: event.organization ?? null,
      };
    case "unauthenticated":
      return { state: "unauthenticated" };
    case "error":
      return {
        state: "error",
        message: event.message ?? "Authentication failed.",
      };
    case "not_checked":
      return NOT_CHECKED;
    case "checking":
      return { state: "checking" };
    case "authenticating":
      return { state: "authenticating", output: [] };
  }
}

function parseAuthEvent(line: string): ProviderAuthEvent | null {
  try {
    const parsed = JSON.parse(line.trim()) as ProviderAuthEvent;
    if (parsed.kind === "auth.result" || parsed.kind === "auth.status") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function createLineReader(onLine: (line: string) => void) {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    while (true) {
      const index = buffer.indexOf("\n");
      if (index < 0) return;
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line.length > 0) onLine(line);
    }
  };
}

async function spawnAuthCommand(
  subcommand: "status" | "login",
  provider: AgentSessionProviderId,
): Promise<ProviderAuthStatus> {
  return new Promise((resolve) => {
    const args = ["agent", "auth", subcommand, "--provider", provider];
    const command = Command.create("lifecycle", args);
    let settled = false;

    const settle = (status: ProviderAuthStatus) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(status);
    };

    const lineReader = createLineReader((line) => {
      const event = parseAuthEvent(line);
      if (!event) return;

      if (event.kind === "auth.status") {
        if (event.isAuthenticating) {
          setProviderStatus(provider, { state: "authenticating", output: event.output });
        } else if (event.error) {
          const status = { state: "error", message: event.error } as const;
          setProviderStatus(provider, status);
          settle(status);
        }
        return;
      }

      const status = statusFromResultEvent(event);
      setProviderStatus(provider, status);
      settle(status);
    });

    command.stdout.on("data", lineReader);
    command.stderr.on("data", (line) => {
      console.error(`[auth:${provider}]`, line);
    });
    command.on("error", (error) => {
      const status = { state: "error", message: error } as const;
      setProviderStatus(provider, status);
      settle(status);
    });
    command.on("close", ({ code, signal }) => {
      if (settled) {
        return;
      }

      const status = {
        state: "error",
        message: `Authentication process exited unexpectedly (code=${code ?? "null"} signal=${signal ?? "null"}).`,
      } as const;
      setProviderStatus(provider, status);
      settle(status);
    });

    void command.spawn().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const status = { state: "error", message } as const;
      setProviderStatus(provider, status);
      settle(status);
    });
  });
}

export async function ensureProviderAuthenticated(
  provider: AgentSessionProviderId,
): Promise<ProviderAuthStatus> {
  let status = state[provider];

  if (status.state === "not_checked" || status.state === "checking") {
    status = await checkProviderAuth(provider);
  }

  if (status.state === "unauthenticated") {
    status = await loginProvider(provider);
  }

  return status;
}

export async function checkProviderAuth(
  provider: AgentSessionProviderId,
): Promise<ProviderAuthStatus> {
  setProviderStatus(provider, { state: "checking" });
  return await spawnAuthCommand("status", provider);
}

export async function loginProvider(provider: AgentSessionProviderId): Promise<ProviderAuthStatus> {
  setProviderStatus(provider, { state: "authenticating", output: [] });
  return await spawnAuthCommand("login", provider);
}

export function getProviderAuthSnapshot(): ProviderAuthState {
  return state;
}

export function useProviderAuthStatus(provider: AgentSessionProviderId): ProviderAuthStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state[provider],
    () => state[provider],
  );
}

export function resetProviderAuthStateForTests(): void {
  state = { claude: NOT_CHECKED, codex: NOT_CHECKED };
  listeners.clear();
}
