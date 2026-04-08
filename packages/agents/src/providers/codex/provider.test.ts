import { describe, expect, test } from "bun:test";

const {
  appendCodexCommandExecutionOutputDelta,
  appendCodexFileChangeOutputDelta,
  buildMcpElicitationMetadata,
  buildCodexTurnDiffItem,
  buildCodexApprovalResponse,
  codexThreadItemToProviderItem,
  createApprovalId,
  createCodexThreadBootstrapRequest,
  mergeCodexItemSnapshot,
} = await import("./provider");

describe("codex provider binding", () => {
  test("starts a new thread over app-server when there is no persisted provider id", () => {
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

  test("resumes an existing thread when provider id is present", () => {
    const result = createCodexThreadBootstrapRequest({
      approvalPolicy: "never",
      dangerousBypass: false,
      modelReasoningEffort: "high",
      providerId: "thread_123",
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

  test("maps MCP tool items onto the normalized provider tool-call shape", () => {
    expect(
      codexThreadItemToProviderItem({
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
        metadata: {
          durationMs: null,
          server: "search",
          tool: "query",
          toolKind: "mcp",
        },
        sourceType: "mcpToolCall",
        status: "running",
        toolCallId: "item_1",
        toolName: "search/query",
        type: "tool_call",
      });
  });

  test("maps file changes with unified diffs onto the normalized provider item shape", () => {
    expect(
      codexThreadItemToProviderItem({
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
      sourceType: "fileChange",
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

  test("appends file change deltas into aggregated diffs", () => {
    expect(
      appendCodexFileChangeOutputDelta(
        {
          diff: "diff --git a/src/app.ts b/src/app.ts\n",
          id: "item_file_1",
          status: "inProgress",
          type: "fileChange",
        },
        "@@ -1 +1 @@\n-old\n+new\n",
      ),
    ).toEqual({
      diff: "diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n-old\n+new\n",
      id: "item_file_1",
      status: "inProgress",
      type: "fileChange",
    });
  });

  test("preserves streamed file diffs when a later snapshot omits them", () => {
    expect(
      mergeCodexItemSnapshot(
        {
          changes: [
            {
              kind: "update",
              path: "/tmp/project/src/app.ts",
            },
          ],
          diff: "diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n-old\n+new\n",
          id: "item_file_2",
          status: "inProgress",
          type: "fileChange",
        },
        {
          changes: [
            {
              kind: "update",
              path: "/tmp/project/src/app.ts",
            },
          ],
          id: "item_file_2",
          status: "completed",
          type: "fileChange",
        },
      ),
    ).toEqual({
      changes: [
        {
          kind: "update",
          path: "/tmp/project/src/app.ts",
        },
      ],
      diff: "diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n-old\n+new\n",
      id: "item_file_2",
      status: "completed",
      type: "fileChange",
    });
  });

  test("preserves streamed command output when a later snapshot omits it", () => {
    expect(
      mergeCodexItemSnapshot(
        {
          aggregatedOutput: "Preparing import\nProcessed 500000 rows\n",
          command: "bun run sync",
          id: "item_cmd_2",
          status: "inProgress",
          type: "commandExecution",
        },
        {
          command: "bun run sync",
          exitCode: 0,
          id: "item_cmd_2",
          status: "completed",
          type: "commandExecution",
        },
      ),
    ).toEqual({
      aggregatedOutput: "Preparing import\nProcessed 500000 rows\n",
      command: "bun run sync",
      exitCode: 0,
      id: "item_cmd_2",
      status: "completed",
      type: "commandExecution",
    });
  });

  test("maps command execution items onto the normalized provider item shape", () => {
    expect(
      codexThreadItemToProviderItem({
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
      metadata: {
        commandActions: null,
        cwd: null,
        durationMs: null,
        processId: null,
      },
      output: "Preparing import\nProcessed 500000 rows\n",
      sourceType: "commandExecution",
      status: "running",
      type: "command_execution",
    });
  });

  test("maps top-level file change diff snapshots onto the normalized provider item shape", () => {
    expect(
      codexThreadItemToProviderItem({
        changes: [
          {
            kind: "update",
            path: "/tmp/project/src/app.ts",
          },
        ],
        diff: "diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new\n",
        id: "item_3",
        status: "inProgress",
        type: "fileChange",
      }),
    ).toEqual({
      changes: [
        {
          kind: "update",
          path: "/tmp/project/src/app.ts",
        },
      ],
      diff: "diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new\n",
      id: "item_3",
      sourceType: "fileChange",
      status: "running",
      type: "file_change",
    });
  });

  test("preserves plan items instead of collapsing them into generic reasoning", () => {
    expect(
      codexThreadItemToProviderItem({
        id: "item_plan_1",
        text: "1. Inspect auth flow\n2. Patch retry logic",
        type: "plan",
      }),
    ).toEqual({
      id: "item_plan_1",
      reasoningKind: "plan",
      sourceType: "plan",
      text: "1. Inspect auth flow\n2. Patch retry logic",
      type: "reasoning",
    });
  });

  test("maps codex-only image and review items into normalized item variants", () => {
    expect(
      codexThreadItemToProviderItem({
        id: "item_image_1",
        path: "/tmp/project/screenshot.png",
        type: "imageView",
      }),
    ).toEqual({
      id: "item_image_1",
      path: "/tmp/project/screenshot.png",
      sourceType: "imageView",
      type: "image_view",
    });

    expect(
      codexThreadItemToProviderItem({
        id: "item_review_1",
        review: "pr-123",
        type: "enteredReviewMode",
      }),
    ).toEqual({
      id: "item_review_1",
      mode: "entered",
      review: "pr-123",
      sourceType: "enteredReviewMode",
      type: "review_mode",
    });
  });

  test("builds a separate aggregate turn diff item for multi-file turns", () => {
    expect(
      buildCodexTurnDiffItem("turn_1", "diff --git a/src/app.ts b/src/app.ts\n", [
        {
          changes: [
            {
              kind: "update",
              path: "/tmp/project/src/app.ts",
            },
          ],
          id: "item_file_1",
          status: "inProgress",
          type: "fileChange",
        },
        {
          changes: [
            {
              kind: "update",
              path: "/tmp/project/src/lib.ts",
            },
          ],
          id: "item_file_2",
          status: "inProgress",
          type: "fileChange",
        },
      ]),
    ).toEqual({
      changes: [
        {
          kind: "update",
          path: "/tmp/project/src/app.ts",
        },
        {
          kind: "update",
          path: "/tmp/project/src/lib.ts",
        },
      ],
      diff: "diff --git a/src/app.ts b/src/app.ts\n",
      id: "turn_1:turn-diff",
      status: "inProgress",
      type: "fileChange",
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

  test("fills url elicitation responses from the request when the UI submits no payload", () => {
    expect(
      buildCodexApprovalResponse(
        {
          method: "mcpServer/elicitation/request",
          params: {
            elicitationId: "elicitation_1",
            message: "Open the URL to continue.",
            mode: "url",
            url: "https://example.com/auth",
          },
        },
        "approve_once",
      ),
    ).toEqual({
      _meta: null,
      action: "accept",
      content: {
        url: "https://example.com/auth",
      },
    });
  });

  test("preserves MCP elicitation ids in approval ids", () => {
    expect(
      createApprovalId("mcpServer/elicitation/request", 42, {
        elicitationId: "elicitation_1",
        serverName: "github",
      }),
    ).toBe("elicitation_1");
  });

  test("preserves MCP elicitation ids in approval metadata", () => {
    expect(
      buildMcpElicitationMetadata({
        elicitationId: "elicitation_1",
        mode: "url",
        serverName: "github",
        url: "https://example.com/auth",
      }),
    ).toEqual({
      _meta: null,
      elicitationId: "elicitation_1",
      method: "mcpServer/elicitation/request",
      mode: "url",
      requestedSchema: null,
      serverName: "github",
      url: "https://example.com/auth",
    });
  });
});
