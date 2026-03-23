import { describe, expect, test } from "bun:test";

const {
  buildCodexApprovalResponse,
  codexThreadItemToWorkerItem,
  createCodexThreadBootstrapRequest,
} = await import("./providers/codex/worker");

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
      input_json: "{\"q\":\"build logs\"}",
      status: "in_progress",
      tool_call_id: "item_1",
      tool_name: "search/query",
      type: "tool_call",
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
