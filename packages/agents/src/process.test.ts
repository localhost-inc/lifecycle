import { beforeEach, describe, expect, test } from "bun:test";
import { runAgentAuthCommand, runAgentCatalogCommand, type AgentProcessRunner } from "./process";

type ClosePayload = {
  code?: number | null;
  signal?: string | null;
};

class FakeStream {
  private readonly listeners = new Set<(chunk: string) => void>();

  on(listener: (chunk: string) => void): void {
    this.listeners.add(listener);
  }

  emit(chunk: string): void {
    for (const listener of this.listeners) {
      listener(chunk);
    }
  }
}

class FakeCommand {
  readonly stderr = new FakeStream();
  readonly stdout = new FakeStream();
  private readonly closeListeners = new Set<(payload: ClosePayload) => void>();
  private readonly errorListeners = new Set<(error: string) => void>();

  constructor(readonly args: string[]) {}

  onClose(listener: (payload: ClosePayload) => void): void {
    this.closeListeners.add(listener);
  }

  onError(listener: (error: string) => void): void {
    this.errorListeners.add(listener);
  }

  onStderrData(listener: (chunk: string) => void): void {
    this.stderr.on(listener);
  }

  onStdoutData(listener: (chunk: string) => void): void {
    this.stdout.on(listener);
  }

  async spawn(): Promise<void> {
    const scenario = queuedScenarios.shift();
    if (!scenario) {
      throw new Error(`No queued scenario for args: ${this.args.join(" ")}`);
    }

    queueMicrotask(() => scenario(this));
  }

  emitClose(payload: ClosePayload): void {
    for (const listener of this.closeListeners) {
      listener(payload);
    }
  }

  emitError(error: string): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }
}

const createdCommands: FakeCommand[] = [];
const queuedScenarios: Array<(command: FakeCommand) => void> = [];

const runner: AgentProcessRunner = {
  createCommand(args: string[]) {
    const command = new FakeCommand(args);
    createdCommands.push(command);
    return command;
  },
};

function emitAuthEvent(command: FakeCommand, event: object): void {
  command.stdout.emit(`${JSON.stringify(event)}\n`);
}

describe("agent auth and catalog commands", () => {
  beforeEach(() => {
    createdCommands.length = 0;
    queuedScenarios.length = 0;
  });

  test("checks provider auth through lifecycle cli", async () => {
    queuedScenarios.push((command) => {
      emitAuthEvent(command, {
        kind: "auth.result",
        provider: "codex",
        state: "authenticated",
        organization: "plus",
      });
      command.emitClose({ code: 0, signal: null });
    });

    const status = await runAgentAuthCommand(runner, "status", "codex");

    expect(createdCommands[0]?.args).toEqual(["agent", "auth", "status", "--provider", "codex"]);
    expect(status).toEqual({
      state: "authenticated",
      email: null,
      organization: "plus",
    });
  });

  test("streams auth status updates while logging in", async () => {
    const updates: unknown[] = [];
    let activeCommand: FakeCommand | null = null;

    queuedScenarios.push((command) => {
      activeCommand = command;
      emitAuthEvent(command, {
        kind: "auth.status",
        provider: "codex",
        isAuthenticating: true,
        output: ["Opening browser..."],
      });
    });

    const loginPromise = runAgentAuthCommand(runner, "login", "codex", (status) => {
      updates.push(status);
    });

    await Promise.resolve();

    emitAuthEvent(activeCommand!, {
      kind: "auth.result",
      provider: "codex",
      state: "authenticated",
      email: "user@example.com",
      organization: "plus",
    });
    activeCommand!.emitClose({ code: 0, signal: null });

    expect(await loginPromise).toEqual({
      state: "authenticated",
      email: "user@example.com",
      organization: "plus",
    });
    expect(updates).toEqual([
      {
        state: "authenticating",
        output: ["Opening browser..."],
      },
      {
        state: "authenticated",
        email: "user@example.com",
        organization: "plus",
      },
    ]);
  });

  test("passes Claude login method through the auth login command", async () => {
    queuedScenarios.push((command) => {
      emitAuthEvent(command, {
        kind: "auth.result",
        provider: "claude",
        state: "authenticated",
        organization: "console",
      });
      command.emitClose({ code: 0, signal: null });
    });

    const status = await runAgentAuthCommand(runner, "login", "claude", undefined, {
      loginMethod: "console",
    });

    expect(createdCommands[0]?.args).toEqual([
      "agent",
      "auth",
      "login",
      "--provider",
      "claude",
      "--login-method",
      "console",
    ]);
    expect(status).toEqual({
      state: "authenticated",
      email: null,
      organization: "console",
    });
  });

  test("passes Claude login method through the auth status command", async () => {
    queuedScenarios.push((command) => {
      emitAuthEvent(command, {
        kind: "auth.result",
        provider: "claude",
        state: "unauthenticated",
      });
      command.emitClose({ code: 0, signal: null });
    });

    const status = await runAgentAuthCommand(runner, "status", "claude", undefined, {
      loginMethod: "console",
    });

    expect(createdCommands[0]?.args).toEqual([
      "agent",
      "auth",
      "status",
      "--provider",
      "claude",
      "--login-method",
      "console",
    ]);
    expect(status).toEqual({
      state: "unauthenticated",
    });
  });

  test("fetches the provider model catalog through lifecycle cli", async () => {
    queuedScenarios.push((command) => {
      command.stdout.emit(
        `${JSON.stringify({
          defaultModel: "default",
          fetchedAt: "2026-03-23T00:00:00.000Z",
          models: [],
          provider: "claude",
          source: "claude_sdk.supportedModels",
          warnings: [],
        })}\n`,
      );
      command.emitClose({ code: 0, signal: null });
    });

    const catalog = await runAgentCatalogCommand(runner, "claude", {
      loginMethod: "console",
    });

    expect(createdCommands[0]?.args).toEqual([
      "agent",
      "catalog",
      "--provider",
      "claude",
      "--login-method",
      "console",
    ]);
    expect(catalog.provider).toBe("claude");
  });

  test("does not pass stale preferred-model flags for codex catalog reads", async () => {
    queuedScenarios.push((command) => {
      command.stdout.emit(
        `${JSON.stringify({
          defaultModel: "gpt-5.4",
          fetchedAt: "2026-03-23T00:00:00.000Z",
          models: [],
          provider: "codex",
          source: "codex_app_server.chatgpt+model/list",
          warnings: [],
        })}\n`,
      );
      command.emitClose({ code: 0, signal: null });
    });

    const catalog = await runAgentCatalogCommand(runner, "codex", {
      preferredModel: "gpt-5-codex",
    });

    expect(createdCommands[0]?.args).toEqual(["agent", "catalog", "--provider", "codex"]);
    expect(catalog.provider).toBe("codex");
  });

  test("surfaces catalog command failures", async () => {
    queuedScenarios.push((command) => {
      command.stderr.emit('{"error":{"message":"catalog failed"}}');
      command.emitClose({ code: 1, signal: null });
    });

    await expect(runAgentCatalogCommand(runner, "codex", {})).rejects.toThrow("catalog failed");
  });
});
