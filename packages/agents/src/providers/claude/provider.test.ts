import { describe, expect, mock, test } from "bun:test";

const createSession = mock(() => ({
  close() {},
  send: async () => {},
  stream: async function* () {},
}));
const prompt = mock(async () => ({
  result: "Test title",
  subtype: "success",
}));
const resumeSession = mock(() => ({
  close() {},
  send: async () => {},
  stream: async function* () {},
  sessionId: "session_123",
}));

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  unstable_v2_createSession: createSession,
  unstable_v2_prompt: prompt,
  unstable_v2_resumeSession: resumeSession,
}));

const { buildClaudeAssistantContentEvents, buildClaudeToolUseEvents, createClaudeProviderSession } =
  await import("./provider");

describe("claude provider binding", () => {
  test("does not invent a provider id for new sessions", () => {
    const result = createClaudeProviderSession({
      dangerousSkipPermissions: false,
      loginMethod: "claudeai",
      model: "sonnet",
      permissionMode: "default",
      workspacePath: "/tmp/project",
    });

    expect(result.providerId).toBeNull();
    expect(typeof result.session.close).toBe("function");
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        includePartialMessages: true,
        model: "sonnet",
        permissionMode: "default",
      }),
    );
  });

  test("preserves the provider id for resumed sessions", () => {
    const result = createClaudeProviderSession({
      dangerousSkipPermissions: false,
      loginMethod: "claudeai",
      model: "sonnet",
      permissionMode: "default",
      providerId: "session_123",
      workspacePath: "/tmp/project",
    });

    expect(result.providerId).toBe("session_123");
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
    const canUseTool = async () => ({ behavior: "deny", message: "nope" }) as const;
    const onElicitation = async () => ({ action: "decline" }) as const;

    createClaudeProviderSession(
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

  test("builds normalized tool-use events from Claude permission callbacks", () => {
    expect(
      buildClaudeToolUseEvents({
        toolInput: { command: "bun test" },
        toolName: "Bash",
        toolUseId: "tool_123",
        turnId: "turn_123",
      }),
    ).toEqual([
      {
        kind: "agent.tool_use.start",
        toolName: "Bash",
        toolUseId: "tool_123",
        turnId: "turn_123",
      },
      {
        inputJson: '{"command":"bun test"}',
        kind: "agent.tool_use.input",
        toolName: "Bash",
        toolUseId: "tool_123",
        turnId: "turn_123",
      },
    ]);
  });

  test("backfills completed assistant thinking and tool_use blocks", () => {
    expect(
      buildClaudeAssistantContentEvents({
        content: [
          { type: "thinking", thinking: "Planning the next step." },
          { id: "tool_123", input: { command: "bun test" }, name: "Bash", type: "tool_use" },
        ],
        emittedBlockIds: new Set(),
        emittedToolUseIds: new Set(),
        turnId: "turn_123",
      }),
    ).toEqual([
      {
        blockId: "thinking:0",
        kind: "agent.thinking.delta",
        text: "Planning the next step.",
        turnId: "turn_123",
      },
      {
        kind: "agent.tool_use.start",
        toolName: "Bash",
        toolUseId: "tool_123",
        turnId: "turn_123",
      },
      {
        inputJson: '{"command":"bun test"}',
        kind: "agent.tool_use.input",
        toolName: "Bash",
        toolUseId: "tool_123",
        turnId: "turn_123",
      },
    ]);
  });

  test("skips completed assistant blocks that were already emitted while streaming", () => {
    const emittedBlockIds = new Set(["turn_123:thinking:0"]);
    const emittedToolUseIds = new Set(["tool_123"]);

    expect(
      buildClaudeAssistantContentEvents({
        content: [
          { type: "thinking", thinking: "Planning the next step." },
          { id: "tool_123", input: { command: "bun test" }, name: "Bash", type: "tool_use" },
        ],
        emittedBlockIds,
        emittedToolUseIds,
        turnId: "turn_123",
      }),
    ).toEqual([]);
  });
});
