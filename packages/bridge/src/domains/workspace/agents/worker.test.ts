import { describe, expect, test } from "bun:test";

import { buildClaudeMcpServers, parseAgentWorkerArgs } from "./worker";

describe("buildClaudeMcpServers", () => {
  test("omits lifecycle MCP when no CLI path is present", () => {
    expect(buildClaudeMcpServers({})).toBeUndefined();
  });

  test("uses the configured lifecycle CLI path for MCP", () => {
    expect(buildClaudeMcpServers({ LIFECYCLE_CLI_PATH: "/tmp/lifecycle" })).toEqual({
      lifecycle: {
        type: "stdio",
        command: "/tmp/lifecycle",
        args: ["mcp"],
      },
    });
  });
});

describe("parseAgentWorkerArgs", () => {
  test("parses codex provider launches", () => {
    const parsed = parseAgentWorkerArgs([
      "agent",
      "codex",
      "--workspace-path",
      "/tmp/workspace",
      "--approval-policy",
      "never",
      "--sandbox-mode",
      "danger-full-access",
      "--dangerous-bypass",
      "--model",
      "gpt-5.4",
      "--model-reasoning-effort",
      "high",
      "--provider-id",
      "thread_123",
    ]);

    expect(parsed).toEqual({
      provider: "codex",
      input: {
        approvalPolicy: "never",
        dangerousBypass: true,
        model: "gpt-5.4",
        modelReasoningEffort: "high",
        providerId: "thread_123",
        sandboxMode: "danger-full-access",
        workspacePath: "/tmp/workspace",
      },
    });
  });

  test("parses claude provider launches and wires lifecycle MCP from env", () => {
    const parsed = parseAgentWorkerArgs(
      [
        "agent",
        "claude",
        "--workspace-path",
        "/tmp/workspace",
        "--permission-mode",
        "plan",
        "--login-method",
        "console",
        "--dangerous-skip-permissions",
        "--effort",
        "high",
        "--model",
        "claude-sonnet",
        "--provider-id",
        "session_123",
      ],
      { LIFECYCLE_CLI_PATH: "/tmp/lifecycle" },
    );

    expect(parsed).toEqual({
      provider: "claude",
      input: {
        dangerousSkipPermissions: true,
        effort: "high",
        loginMethod: "console",
        mcpServers: {
          lifecycle: {
            type: "stdio",
            command: "/tmp/lifecycle",
            args: ["mcp"],
          },
        },
        model: "claude-sonnet",
        permissionMode: "plan",
        providerId: "session_123",
        workspacePath: "/tmp/workspace",
      },
    });
  });
});
