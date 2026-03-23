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
): Promise<void> {
  const args = ["agent", "auth", subcommand, "--provider", provider];
  const command = Command.create("lifecycle", args);

  const lineReader = createLineReader((line) => {
    const event = parseAuthEvent(line);
    if (!event) return;

    if (event.kind === "auth.status") {
      if (event.is_authenticating) {
        setProviderStatus(provider, { state: "authenticating", output: event.output });
      } else if (event.error) {
        setProviderStatus(provider, { state: "error", message: event.error });
      }
      return;
    }

    if (event.kind === "auth.result") {
      switch (event.state) {
        case "authenticated":
          setProviderStatus(provider, {
            state: "authenticated",
            email: event.email ?? null,
            organization: event.organization ?? null,
          });
          break;
        case "unauthenticated":
          setProviderStatus(provider, { state: "unauthenticated" });
          break;
        case "error":
          setProviderStatus(provider, {
            state: "error",
            message: event.message ?? "Authentication failed.",
          });
          break;
        case "not_checked":
          setProviderStatus(provider, NOT_CHECKED);
          break;
        default:
          break;
      }
    }
  });

  command.stdout.on("data", lineReader);
  command.stderr.on("data", (line) => {
    console.error(`[auth:${provider}]`, line);
  });
  command.on("error", (error) => {
    setProviderStatus(provider, { state: "error", message: error });
  });

  await command.spawn();
}

export async function checkProviderAuth(provider: AgentSessionProviderId): Promise<void> {
  setProviderStatus(provider, { state: "checking" });
  await spawnAuthCommand("status", provider);
}

export async function loginProvider(provider: AgentSessionProviderId): Promise<void> {
  setProviderStatus(provider, { state: "authenticating", output: [] });
  await spawnAuthCommand("login", provider);
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
