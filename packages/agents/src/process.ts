import type { AgentProviderId } from "@lifecycle/contracts";
import type { AgentModelCatalog } from "./catalog";
import type { AgentAuthEvent, AgentAuthStatus } from "./providers/auth";
import type { ClaudeLoginMethod } from "./providers/claude/env";

export interface AgentModelCatalogOptions {
  enabled?: boolean;
  loginMethod?: ClaudeLoginMethod;
  preferredModel?: string;
}

export interface AgentAuthOptions {
  loginMethod?: ClaudeLoginMethod;
}

export interface AgentProcessClosePayload {
  code?: number | null;
  signal?: string | null;
}

export interface AgentProcess {
  onClose(listener: (payload: AgentProcessClosePayload) => void): void;
  onError(listener: (error: string) => void): void;
  onStderrData(listener: (chunk: string) => void): void;
  onStdoutData(listener: (chunk: string) => void): void;
  spawn(): Promise<void>;
}

export interface AgentProcessRunner {
  createCommand(args: string[]): AgentProcess;
}

function statusFromResultEvent(
  event: Extract<AgentAuthEvent, { kind: "auth.result" }>,
): AgentAuthStatus {
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
      return { state: "not_checked" };
    case "checking":
      return { state: "checking" };
    case "authenticating":
      return { state: "authenticating", output: [] };
  }
}

function parseAuthEvent(line: string): AgentAuthEvent | null {
  try {
    const parsed = JSON.parse(line.trim()) as AgentAuthEvent;
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
      if (index < 0) {
        return;
      }

      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line.length > 0) {
        onLine(line);
      }
    }
  };
}

export async function runAgentAuthCommand(
  runner: AgentProcessRunner,
  subcommand: "status" | "login",
  provider: AgentProviderId,
  onStatus?: (status: AgentAuthStatus) => void,
  options?: AgentAuthOptions,
): Promise<AgentAuthStatus> {
  return await new Promise((resolve) => {
    const args = ["agent", "auth", subcommand, "--provider", provider];
    if (provider === "claude" && options?.loginMethod) {
      args.push("--login-method", options.loginMethod);
    }
    const command = runner.createCommand(args);
    let settled = false;

    const settle = (status: AgentAuthStatus) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(status);
    };

    const lineReader = createLineReader((line) => {
      const event = parseAuthEvent(line);
      if (!event) {
        return;
      }

      if (event.kind === "auth.status") {
        if (event.isAuthenticating) {
          onStatus?.({ state: "authenticating", output: event.output });
        } else if (event.error) {
          const status = { state: "error", message: event.error } as const;
          onStatus?.(status);
          settle(status);
        }
        return;
      }

      const status = statusFromResultEvent(event);
      onStatus?.(status);
      settle(status);
    });

    command.onStdoutData(lineReader);
    command.onStderrData(() => {});
    command.onError((error) => {
      const status = { state: "error", message: error } as const;
      onStatus?.(status);
      settle(status);
    });
    command.onClose(({ code, signal }) => {
      if (settled) {
        return;
      }

      const status = {
        state: "error",
        message: `Authentication process exited unexpectedly (code=${code ?? "null"} signal=${signal ?? "null"}).`,
      } as const;
      onStatus?.(status);
      settle(status);
    });

    void command.spawn().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const status = { state: "error", message } as const;
      onStatus?.(status);
      settle(status);
    });
  });
}

export async function runAgentCatalogCommand(
  runner: AgentProcessRunner,
  provider: AgentProviderId,
  options: AgentModelCatalogOptions,
): Promise<AgentModelCatalog> {
  const args = ["agent", "catalog", "--provider", provider];
  if (provider === "claude" && options.loginMethod) {
    args.push("--login-method", options.loginMethod);
  }

  return await new Promise((resolve, reject) => {
    const command = runner.createCommand(args);
    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      callback();
    };

    command.onStdoutData((chunk) => {
      stdout += chunk;
    });
    command.onStderrData((chunk) => {
      stderr += chunk;
    });
    command.onError((message) => {
      settle(() => reject(new Error(message)));
    });
    command.onClose(({ code, signal }) => {
      settle(() => {
        if (code !== 0) {
          reject(
            new Error(
              stderr.trim() ||
                `Catalog command exited unexpectedly (code=${code ?? "null"} signal=${signal ?? "null"}).`,
            ),
          );
          return;
        }

        try {
          resolve(JSON.parse(stdout) as AgentModelCatalog);
        } catch (error) {
          reject(
            error instanceof Error ? error : new Error("Failed to parse agent model catalog."),
          );
        }
      });
    });

    void command.spawn().catch((error) => {
      settle(() => reject(error instanceof Error ? error : new Error(String(error))));
    });
  });
}
