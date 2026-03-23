import { describe, expect, mock, test } from "bun:test";

const createSession = mock(() => ({ close() {}, send: async () => {}, stream: async function* () {} }));
const resumeSession = mock(() => ({ close() {}, send: async () => {}, stream: async function* () {}, sessionId: "session_123" }));

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  unstable_v2_createSession: createSession,
  unstable_v2_resumeSession: resumeSession,
}));

const { createClaudeWorkerSession } = await import("./providers/claude/worker");

describe("claude worker session binding", () => {
  test("does not invent a provider session id for new workers", () => {
    const result = createClaudeWorkerSession({
      dangerousSkipPermissions: false,
      loginMethod: "claudeai",
      model: "sonnet",
      permissionMode: "default",
      workspacePath: "/tmp/project",
    });

    expect(result.providerSessionId).toBeNull();
    expect(typeof result.session.close).toBe("function");
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        includePartialMessages: true,
        model: "sonnet",
        permissionMode: "default",
      }),
    );
  });

  test("preserves the provider session id for resumed workers", () => {
    const result = createClaudeWorkerSession({
      dangerousSkipPermissions: false,
      loginMethod: "claudeai",
      model: "sonnet",
      permissionMode: "default",
      providerSessionId: "session_123",
      workspacePath: "/tmp/project",
    });

    expect(result.providerSessionId).toBe("session_123");
    expect(typeof result.session.close).toBe("function");
    expect(resumeSession).toHaveBeenCalledWith(
      "session_123",
      expect.objectContaining({
        includePartialMessages: true,
        model: "sonnet",
        permissionMode: "default",
      }),
    );
  });

  test("forwards approval and elicitation callbacks into the session options", () => {
    const canUseTool = async () => ({ behavior: "deny", message: "nope" } as const);
    const onElicitation = async () => ({ action: "decline" } as const);

    createClaudeWorkerSession(
      {
        dangerousSkipPermissions: false,
        loginMethod: "claudeai",
        model: "sonnet",
        permissionMode: "default",
        workspacePath: "/tmp/project",
      },
      { canUseTool, onElicitation },
    );

    expect(createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        canUseTool,
        onElicitation,
      }),
    );
  });
});
