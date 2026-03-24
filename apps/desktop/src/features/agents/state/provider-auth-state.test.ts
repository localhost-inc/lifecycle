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
      throw new Error(`No queued auth scenario for args: ${this.args.join(" ")}`);
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

const {
  checkProviderAuth,
  ensureProviderAuthenticated,
  getProviderAuthSnapshot,
  loginProvider,
  resetProviderAuthStateForTests,
} = await import("./provider-auth-state");

function emitAuthEvent(command: FakeCommand, event: object): void {
  command.stdout.emit(`${JSON.stringify(event)}\n`);
}

describe("provider auth state", () => {
  beforeEach(() => {
    createdCommands.length = 0;
    queuedScenarios.length = 0;
    resetProviderAuthStateForTests();
  });

  test("checkProviderAuth resolves the provider result", async () => {
    queuedScenarios.push((command) => {
      emitAuthEvent(command, {
        kind: "auth.result",
        provider: "codex",
        state: "authenticated",
        organization: "plus",
      });
      command.emitClose({ code: 0, signal: null });
    });

    const status = await checkProviderAuth("codex");

    expect(createdCommands[0]?.args).toEqual(["agent", "auth", "status", "--provider", "codex"]);
    expect(status).toEqual({
      state: "authenticated",
      email: null,
      organization: "plus",
    });
    expect(getProviderAuthSnapshot().codex).toEqual(status);
  });

  test("loginProvider does not resolve until an auth result arrives", async () => {
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

    let resolved = false;
    const loginPromise = loginProvider("codex").then((status) => {
      resolved = true;
      return status;
    });

    await Promise.resolve();

    expect(resolved).toBeFalse();
    expect(getProviderAuthSnapshot().codex).toEqual({
      state: "authenticating",
      output: ["Opening browser..."],
    });

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
  });

  test("ensureProviderAuthenticated checks status before starting login", async () => {
    queuedScenarios.push((command) => {
      emitAuthEvent(command, {
        kind: "auth.result",
        provider: "codex",
        state: "unauthenticated",
      });
      command.emitClose({ code: 0, signal: null });
    });
    queuedScenarios.push((command) => {
      emitAuthEvent(command, {
        kind: "auth.result",
        provider: "codex",
        state: "authenticated",
        organization: "plus",
      });
      command.emitClose({ code: 0, signal: null });
    });

    const status = await ensureProviderAuthenticated("codex");

    expect(createdCommands.map((command) => command.args)).toEqual([
      ["agent", "auth", "status", "--provider", "codex"],
      ["agent", "auth", "login", "--provider", "codex"],
    ]);
    expect(status).toEqual({
      state: "authenticated",
      email: null,
      organization: "plus",
    });
  });
});
