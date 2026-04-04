import { describe, expect, mock, test } from "bun:test";

const connectLocalAgentWorker = mock(async () => ({
  cancelTurn: async () => {},
  resolveApproval: async () => {},
  sendTurn: async () => {},
}));

mock.module("./worker-connection", () => ({
  connectLocalAgentWorker,
}));

const { createLocalAgentWorker } = await import("./worker");

describe("createLocalAgentWorker", () => {
  test("fails startup when desktop rpc session creation fails", async () => {
    const worker = createLocalAgentWorker({
      commandRunner: {
        createCommand: () => ({
          onClose: () => {},
          onError: () => {},
          onStderrData: () => {},
          onStdoutData: () => {},
          spawn: async () => {},
        }),
      },
      invoke: async (command) => {
        if (command === "desktop_rpc_create_agent_session") {
          throw new Error("bridge offline");
        }
        throw new Error(`unexpected command: ${command}`);
      },
      readHarnessSettings: async () => ({}),
    });

    await expect(
      worker.startSession(
        {
          id: "session_1",
          workspace_id: "workspace_1",
          provider: "claude",
          provider_session_id: null,
          title: "",
          status: "starting",
          last_message_at: null,
          created_at: "2026-03-29T00:00:00.000Z",
          updated_at: "2026-03-29T00:00:00.000Z",
        },
        {
          workspaceHost: "local",
          workspaceId: "workspace_1",
          worktreePath: "/tmp/project",
        },
        {} as never,
        {
          onEvent: () => {},
          onState: () => {},
        },
      ),
    ).rejects.toThrow(
      "Failed to create desktop rpc session for workspace workspace_1: bridge offline",
    );

    expect(connectLocalAgentWorker).not.toHaveBeenCalled();
  });
});
