import { execFile } from "node:child_process";
import type { AgentAuthEvent } from "../auth";
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

/**
 * Check whether Claude credentials exist by running `claude auth status`.
 */
export async function checkClaudeAuth(): Promise<void> {
  try {
    const { stdout, code } = await run("claude", ["auth", "status"]);

    if (code !== 0 || !stdout.trim()) {
      emit({
        kind: "auth.result",
        provider: "claude",
        state: "unauthenticated",
      });
      return;
    }

    const result = JSON.parse(stdout.trim()) as ClaudeAuthStatusResult;

    if (result.loggedIn) {
      emit({
        kind: "auth.result",
        provider: "claude",
        state: "authenticated",
        email: result.email ?? null,
        organization: result.orgName ?? null,
      });
    } else {
      emit({
        kind: "auth.result",
        provider: "claude",
        state: "unauthenticated",
      });
    }
  } catch (error) {
    emit({
      kind: "auth.result",
      provider: "claude",
      state: "error",
      message: error instanceof Error ? error.message : "Failed to check Claude auth status.",
    });
  }
}

/**
 * Trigger the Claude OAuth login flow by running `claude auth login`.
 * The CLI opens the browser for OAuth and blocks until complete.
 */
export async function loginClaudeAuth(
  loginMethod: ClaudeLoginMethod = "claudeai",
): Promise<void> {
  emit({
    kind: "auth.status",
    provider: "claude",
    isAuthenticating: true,
    output: [
      loginMethod === "console"
        ? "Opening browser for Anthropic Console authentication..."
        : "Opening browser for Claude authentication...",
    ],
  });

  try {
    const authFlag = loginMethod === "console" ? "--console" : "--claudeai";
    const { stdout, stderr, code } = await run("claude", ["auth", "login", authFlag]);

    if (code !== 0) {
      emit({
        kind: "auth.result",
        provider: "claude",
        state: "error",
        message: stderr.trim() || "Claude login failed.",
      });
      return;
    }

    // After login succeeds, check status for account details
    const statusResult = await run("claude", ["auth", "status"]);
    let email: string | null = null;
    let organization: string | null = null;

    try {
      const parsed = JSON.parse(statusResult.stdout.trim()) as ClaudeAuthStatusResult;
      email = parsed.email ?? null;
      organization = parsed.orgName ?? null;
    } catch {
      // Status parsing is best-effort after successful login
    }

    emit({
      kind: "auth.result",
      provider: "claude",
      state: "authenticated",
      email,
      organization,
    });

    void stdout;
  } catch (error) {
    emit({
      kind: "auth.result",
      provider: "claude",
      state: "error",
      message: error instanceof Error ? error.message : "Failed to run Claude login.",
    });
  }
}
