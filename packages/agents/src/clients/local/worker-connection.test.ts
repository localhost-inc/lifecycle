import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { LocalAgentInvoke } from "./worker-connection";
import { connectLocalAgentWorker } from "./worker-connection";

const originalWebSocket = globalThis.WebSocket;

class FakeWebSocket {
  static readonly OPEN = 1;
  readonly readyState = FakeWebSocket.OPEN;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;

  constructor(readonly url: string) {
    queueMicrotask(() => {
      this.onopen?.();
      this.onmessage?.({
        data: JSON.stringify({
          kind: "worker.state",
          sessionId: "session_1",
          provider: "claude",
          status: "waiting_input",
        }),
      });
    });
  }

  send(): void {}
}

describe("connectLocalAgentWorker", () => {
  beforeEach(() => {
    // @ts-expect-error test websocket stub
    globalThis.WebSocket = FakeWebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  test("starts the local worker through spawn_managed_process", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    let registrationReads = 0;
    const invoke: LocalAgentInvoke = async <T>(
      command: string,
      args?: Record<string, unknown>,
    ): Promise<T> => {
      calls.push(args ? { command, args } : { command });

      switch (command) {
        case "resolve_lifecycle_root_path":
          return "/tmp/lifecycle" as T;
        case "read_json_file":
          registrationReads += 1;
          return (
            registrationReads < 2
              ? null
              : {
                  pid: 123,
                  port: 4312,
                  sessionId: "session_1",
                  status: "ready",
                  token: "secret",
                }
          ) as T;
        case "spawn_managed_process":
          return { pid: 123 } as T;
        default:
          return null as T;
      }
    };

    const connection = await connectLocalAgentWorker(
      {
        invoke,
      },
      {
        cwd: "/tmp/project",
        env: { TEST: "1" },
        launchArgs: ["--provider", "claude"],
        onEvent: () => {},
        onState: () => {},
        sessionId: "session_1",
      },
    );

    expect(connection.isHealthy?.()).toBe(true);
    expect(calls).toContainEqual({
      command: "spawn_managed_process",
      args: {
        request: {
          id: "agent-worker-session_1",
          args: [
            "agent",
            "worker",
            "start",
            "--provider",
            "claude",
            "--registration-path",
            "/tmp/lifecycle/agents/workers/session_1.json",
          ],
          cwd: "/tmp/project",
          env: { TEST: "1" },
          logDir: "/tmp/lifecycle/agents/workers/logs",
        },
      },
    });
  });
});
