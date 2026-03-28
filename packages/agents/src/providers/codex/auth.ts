import { spawn } from "node:child_process";
import type { AgentAuthEvent, AgentAuthStatus } from "../auth";
import { CodexAppServerClient, type CodexAccountReadResult, isRecord } from "./app-server";

function emit(event: AgentAuthEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

interface CodexChatGptLoginStartResult {
  authUrl: string;
  loginId: string;
  type: "chatgpt";
}

interface CodexLoginCompletedNotification {
  error?: string | null;
  loginId: string | null;
  success: boolean;
}

function mapAccountReadResultToStatus(result: CodexAccountReadResult): AgentAuthStatus {
  if (!result.requiresOpenaiAuth) {
    return {
      state: "authenticated",
      email: null,
      organization: null,
    };
  }

  if (result.account?.type === "chatgpt") {
    return {
      state: "authenticated",
      email: result.account.email ?? null,
      organization: result.account.planType ?? "ChatGPT",
    };
  }

  if (result.account?.type === "apiKey") {
    return {
      state: "authenticated",
      email: null,
      organization: "API key",
    };
  }

  return { state: "unauthenticated" };
}

export function codexProviderAuthStatusFromAccountRead(
  result: CodexAccountReadResult,
): AgentAuthStatus {
  return mapAccountReadResultToStatus(result);
}

function statusToResultEvent(status: AgentAuthStatus): AgentAuthEvent {
  switch (status.state) {
    case "authenticated":
      return {
        kind: "auth.result",
        provider: "codex",
        state: "authenticated",
        email: status.email,
        organization: status.organization,
      };
    case "error":
      return {
        kind: "auth.result",
        provider: "codex",
        state: "error",
        message: status.message,
      };
    case "unauthenticated":
      return {
        kind: "auth.result",
        provider: "codex",
        state: "unauthenticated",
      };
    case "checking":
    case "authenticating":
    case "not_checked":
      return {
        kind: "auth.result",
        provider: "codex",
        state: "error",
        message: "Unexpected intermediate auth state.",
      };
  }
}

function openUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
    const args = platform === "win32" ? ["/c", "start", "", url] : [url];
    const child = spawn(command, args, {
      detached: platform !== "win32",
      stdio: "ignore",
    });

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function isCodexLoginCompletedNotification(
  params: unknown,
): params is CodexLoginCompletedNotification {
  return (
    isRecord(params) &&
    typeof params.success === "boolean" &&
    (typeof params.loginId === "string" || params.loginId === null) &&
    (typeof params.error === "string" || params.error === null || params.error === undefined)
  );
}

async function readAccountStatus(
  client: CodexAppServerClient,
  refreshToken: boolean,
): Promise<AgentAuthStatus> {
  const result = (await client.request("account/read", {
    refreshToken,
  })) as CodexAccountReadResult;
  return mapAccountReadResultToStatus(result);
}

export async function checkCodexAuth(): Promise<void> {
  const client = new CodexAppServerClient();

  try {
    await client.initialize();
    emit(statusToResultEvent(await readAccountStatus(client, false)));
  } catch (error) {
    emit({
      kind: "auth.result",
      provider: "codex",
      state: "error",
      message: error instanceof Error ? error.message : "Failed to check Codex auth status.",
    });
  } finally {
    await client.close();
  }
}

export async function loginCodexAuth(): Promise<void> {
  const client = new CodexAppServerClient();

  emit({
    kind: "auth.status",
    provider: "codex",
    isAuthenticating: true,
    output: ["Starting Codex ChatGPT authentication..."],
  });

  try {
    await client.initialize();

    const currentStatus = await readAccountStatus(client, false);
    if (currentStatus.state === "authenticated") {
      emit(statusToResultEvent(currentStatus));
      return;
    }

    const loginStart = (await client.request("account/login/start", {
      type: "chatgpt",
    })) as CodexChatGptLoginStartResult;

    emit({
      kind: "auth.status",
      provider: "codex",
      isAuthenticating: true,
      output: ["Opening browser for Codex ChatGPT authentication..."],
    });
    await openUrl(loginStart.authUrl);

    const completion = await new Promise<CodexLoginCompletedNotification>((resolve, reject) => {
      const cleanup = client.onNotification((method, params) => {
        if (method !== "account/login/completed" || !isCodexLoginCompletedNotification(params)) {
          return;
        }
        if (params.loginId !== loginStart.loginId) {
          return;
        }
        cleanup();
        resolve(params);
      });

      client.onError((error) => {
        cleanup();
        reject(error);
      });
      client.onClose((code, signal) => {
        cleanup();
        reject(
          new Error(
            `Codex auth process exited before login completed (code=${code ?? "null"} signal=${signal ?? "null"}).`,
          ),
        );
      });
    });

    if (!completion.success) {
      emit({
        kind: "auth.result",
        provider: "codex",
        state: "error",
        message: completion.error ?? "Codex login failed.",
      });
      return;
    }

    emit(statusToResultEvent(await readAccountStatus(client, true)));
  } catch (error) {
    emit({
      kind: "auth.result",
      provider: "codex",
      state: "error",
      message: error instanceof Error ? error.message : "Failed to run Codex login.",
    });
  } finally {
    await client.close();
  }
}
