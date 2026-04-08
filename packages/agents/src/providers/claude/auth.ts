import { execFile } from "node:child_process";
import type { AgentAuthEvent, AgentAuthStatus } from "../auth";
import type { ClaudeLoginMethod } from "./env";

function emit(event: AgentAuthEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function run(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 10_000 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout?.toString() ?? "",
        stderr: stderr?.toString() ?? "",
        code: error ? ((error as { code?: number }).code ?? 1) : 0,
      });
    });
  });
}

interface ClaudeAuthStatusResult {
  loggedIn: boolean;
  authMethod?: string;
  email?: string;
  orgName?: string;
  subscriptionType?: string;
}

function resultEventFromStatus(
  status: Exclude<AgentAuthStatus, { state: "authenticating" }>,
): AgentAuthEvent {
  switch (status.state) {
    case "authenticated":
      return {
        kind: "auth.result",
        provider: "claude",
        state: "authenticated",
        email: status.email,
        organization: status.organization,
      };
    case "unauthenticated":
      return {
        kind: "auth.result",
        provider: "claude",
        state: "unauthenticated",
      };
    case "error":
      return {
        kind: "auth.result",
        provider: "claude",
        state: "error",
        message: status.message,
      };
    case "not_checked":
      return {
        kind: "auth.result",
        provider: "claude",
        state: "not_checked",
      };
    case "checking":
      return {
        kind: "auth.result",
        provider: "claude",
        state: "checking",
      };
  }
}

function authenticatingStatus(
  loginMethod: ClaudeLoginMethod,
): Extract<AgentAuthStatus, { state: "authenticating" }> {
  return {
    state: "authenticating",
    output: [
      loginMethod === "console"
        ? "Opening browser for Anthropic Console authentication..."
        : "Opening browser for Claude authentication...",
    ],
  };
}

function parseClaudeStatusResult(stdout: string): AgentAuthStatus {
  if (!stdout.trim()) {
    return { state: "unauthenticated" };
  }

  const result = JSON.parse(stdout.trim()) as ClaudeAuthStatusResult;
  if (!result.loggedIn) {
    return { state: "unauthenticated" };
  }

  return {
    state: "authenticated",
    email: result.email ?? null,
    organization: result.orgName ?? null,
  };
}

export async function checkClaudeAuthStatus(): Promise<AgentAuthStatus> {
  try {
    const { stdout, code } = await run("claude", ["auth", "status"]);
    if (code !== 0) {
      return { state: "unauthenticated" };
    }

    return parseClaudeStatusResult(stdout);
  } catch (error) {
    return {
      state: "error",
      message: error instanceof Error ? error.message : "Failed to check Claude auth status.",
    };
  }
}

/**
 * Check whether Claude credentials exist by running `claude auth status`.
 */
export async function checkClaudeAuth(): Promise<void> {
  const status = await checkClaudeAuthStatus();
  if (status.state === "authenticating") {
    throw new Error("Claude auth status should not enter the authenticating state.");
  }
  emit(resultEventFromStatus(status));
}

export async function loginClaudeAuthStatus(
  loginMethod: ClaudeLoginMethod = "claudeai",
  onStatus?: (status: Extract<AgentAuthStatus, { state: "authenticating" }>) => void,
): Promise<AgentAuthStatus> {
  onStatus?.(authenticatingStatus(loginMethod));

  try {
    const authFlag = loginMethod === "console" ? "--console" : "--claudeai";
    const { stdout, stderr, code } = await run("claude", ["auth", "login", authFlag]);

    if (code !== 0) {
      return {
        state: "error",
        message: stderr.trim() || "Claude login failed.",
      };
    }

    const statusResult = await run("claude", ["auth", "status"]);
    try {
      const parsed = parseClaudeStatusResult(statusResult.stdout);
      if (parsed.state === "authenticated") {
        return parsed;
      }
    } catch {
      // Fall through to the successful login fallback below.
    }

    void stdout;
    return {
      state: "authenticated",
      email: null,
      organization: null,
    };
  } catch (error) {
    return {
      state: "error",
      message: error instanceof Error ? error.message : "Failed to run Claude login.",
    };
  }
}

/**
 * Trigger the Claude OAuth login flow by running `claude auth login`.
 * The CLI opens the browser for OAuth and blocks until complete.
 */
export async function loginClaudeAuth(loginMethod: ClaudeLoginMethod = "claudeai"): Promise<void> {
  const status = await loginClaudeAuthStatus(loginMethod, (nextStatus) => {
    emit({
      kind: "auth.status",
      provider: "claude",
      isAuthenticating: true,
      output: nextStatus.output,
    });
  });

  if (status.state === "authenticating") {
    throw new Error("Claude login should not settle in the authenticating state.");
  }
  emit(resultEventFromStatus(status));
}
