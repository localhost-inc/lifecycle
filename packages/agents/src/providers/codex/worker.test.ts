import { describe, expect, test } from "bun:test";

const {
  appendCodexCommandExecutionOutputDelta,
  buildCodexApprovalResponse,
  codexThreadItemToWorkerItem,
  createCodexThreadBootstrapRequest,
} = await import("./worker");

describe("codex worker session binding", () => {
  test("starts a new thread over app-server when there is no persisted provider session id", () => {
    const result = createCodexThreadBootstrapRequest({
      approvalPolicy: "untrusted",
      dangerousBypass: false,
      sandboxMode: "workspace-write",
      workspacePath: "/tmp/project",
    });

    expect(result).toEqual({
      method: "thread/start",
      params: expect.objectContaining({
        approvalPolicy: "untrusted",
        cwd: "/tmp/project",
        experimentalRawEvents: false,
        persistExtendedHistory: true,
        sandbox: "workspace-write",
      }),
    });
  });

  test("resumes an existing thread when provider session id is present", () => {
    const result = createCodexThreadBootstrapRequest({
      approvalPolicy: "never",
      dangerousBypass: false,
      modelReasoningEffort: "high",
      providerSessionId: "thread_123",
      sandboxMode: "danger-full-access",
      workspacePath: "/tmp/project",
    });

    expect(result).toEqual({
      method: "thread/resume",
      params: expect.objectContaining({
        approvalPolicy: "never",
        config: { model_reasoning_effort: "high" },
        cwd: "/tmp/project",
        persistExtendedHistory: true,
        sandbox: "danger-full-access",
        threadId: "thread_123",
      }),
    });
  });

  test("maps MCP tool items onto the normalized worker tool-call shape", () => {
    expect(
      codexThreadItemToWorkerItem({
        arguments: { q: "build logs" },
        id: "item_1",
        server: "search",
        status: "inProgress",
        tool: "query",
        type: "mcpToolCall",
      }),
    ).toEqual({
      id: "item_1",
      inputJson: '{"q":"build logs"}',
      status: "running",
      toolCallId: "item_1",
      toolName: "search/query",
      type: "tool_call",
    });
  });

  test("maps file changes with unified diffs onto the normalized worker item shape", () => {
    expect(
      codexThreadItemToWorkerItem({
        changes: [
          {
            diff: "diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new\n",
            kind: "update",
            path: "/tmp/project/src/app.ts",
          },
        ],
        id: "item_2",
        status: "inProgress",
        type: "fileChange",
      }),
    ).toEqual({
      changes: [
        {
          diff: "diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new\n",
          kind: "update",
          path: "/tmp/project/src/app.ts",
        },
      ],
      diff: "diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new\n",
      id: "item_2",
      status: "running",
      type: "file_change",
    });
  });

  test("appends command execution deltas into aggregated output", () => {
    expect(
      appendCodexCommandExecutionOutputDelta(
        {
          aggregatedOutput: "Preparing import\n",
          command: "bun run sync",
          id: "item_cmd_1",
          status: "inProgress",
          type: "commandExecution",
        },
        "Processed 500000 rows\n",
      ),
    ).toEqual({
      aggregatedOutput: "Preparing import\nProcessed 500000 rows\n",
      command: "bun run sync",
      id: "item_cmd_1",
      status: "inProgress",
      type: "commandExecution",
    });
  });

  test("maps command execution items onto the normalized worker item shape", () => {
    expect(
      codexThreadItemToWorkerItem({
        aggregatedOutput: "Preparing import\nProcessed 500000 rows\n",
        command: "bun run sync",
        exitCode: 0,
        id: "item_cmd_1",
        status: "inProgress",
        type: "commandExecution",
      }),
    ).toEqual({
      command: "bun run sync",
      exitCode: 0,
      id: "item_cmd_1",
      output: "Preparing import\nProcessed 500000 rows\n",
      status: "running",
      type: "command_execution",
    });
  });

  test("maps unified approval decisions onto command approval responses", () => {
    expect(
      buildCodexApprovalResponse(
        {
          method: "item/commandExecution/requestApproval",
          params: {},
        },
        "approve_session",
      ),
    ).toEqual({ decision: "acceptForSession" });

    expect(
      buildCodexApprovalResponse(
        {
          method: "item/commandExecution/requestApproval",
          params: {},
        },
        "reject",
      ),
    ).toEqual({ decision: "decline" });
  });

  test("maps question answers onto app-server request_user_input responses", () => {
    expect(
      buildCodexApprovalResponse(
        {
          method: "item/tool/requestUserInput",
          params: {},
        },
        "approve_once",
        {
          answers: {
            q_color: "blue",
            q_tags: ["ui", "desktop"],
          },
        },
      ),
    ).toEqual({
      answers: {
        q_color: { answers: ["blue"] },
        q_tags: { answers: ["ui", "desktop"] },
      },
    });
  });
});
