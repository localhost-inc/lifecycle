import { beforeEach, describe, expect, mock, test } from "bun:test";

type ClosePayload = {
  code?: number | null;
  signal?: string | null;
};

class FakeStream {
  private readonly listeners = new Set<(chunk: string) => void>();

  on(event: "data", listener: (chunk: string) => void): void {
    if (event === "data") {
      this.listeners.add(listener);
    }
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

  on(
    event: "close" | "error",
    listener: ((payload: ClosePayload) => void) | ((error: string) => void),
  ): void {
    if (event === "close") {
      this.closeListeners.add(listener as (payload: ClosePayload) => void);
      return;
    }

    this.errorListeners.add(listener as (error: string) => void);
  }

  async spawn(): Promise<object> {
    const scenario = queuedScenarios.shift();
    if (!scenario) {
      throw new Error(`No queued catalog scenario for args: ${this.args.join(" ")}`);
    }

    queueMicrotask(() => scenario(this));
    return {};
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

mock.module("@tauri-apps/plugin-shell", () => ({
  Command: {
    create(_program: string, args: string[]) {
      const command = new FakeCommand(args);
      createdCommands.push(command);
      return command;
    },
  },
}));

const { fetchProviderModelCatalog } = await import("./use-provider-model-catalog");

describe("provider model catalog state", () => {
  beforeEach(() => {
    createdCommands.length = 0;
    queuedScenarios.length = 0;
  });

  test("fetches the Claude catalog with the selected login method", async () => {
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

    const catalog = await fetchProviderModelCatalog("claude", {
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

  test("does not pass stale preferred-model flags for Codex", async () => {
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

    const catalog = await fetchProviderModelCatalog("codex", {
      preferredModel: "gpt-5-codex",
    });

    expect(createdCommands[0]?.args).toEqual([
      "agent",
      "catalog",
      "--provider",
      "codex",
    ]);
    expect(catalog.provider).toBe("codex");
  });

  test("surfaces command failures", async () => {
    queuedScenarios.push((command) => {
      command.stderr.emit('{"error":{"message":"catalog failed"}}');
      command.emitClose({ code: 1, signal: null });
    });

    await expect(fetchProviderModelCatalog("codex", {})).rejects.toThrow("catalog failed");
  });
});
