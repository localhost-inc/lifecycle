import { describe, expect, test } from "bun:test";
import { LifecycleSettingsSchema, type LifecycleSettings } from "@lifecycle/contracts";
import { resolveTerminalLaunch } from "./launch-profile";

function settings(overrides: Partial<LifecycleSettings["terminal"]> = {}): LifecycleSettings {
  return LifecycleSettingsSchema.parse({
    terminal: {
      ...overrides,
    },
  });
}

describe("terminal launch profiles", () => {
  test("resolves Claude launch settings into an interactive CLI command", () => {
    const resolved = resolveTerminalLaunch(
      settings({
        profiles: {
          claude: {
            launcher: "claude",
            label: "Claude",
            settings: {
              model: "claude-sonnet-4-6",
              permissionMode: "plan",
              effort: "high",
            },
          },
        },
      }),
      "claude",
    );

    expect(resolved.kind).toBe("claude");
    expect(resolved.launchSpec).toEqual({
      program: "claude",
      args: ["--model", "claude-sonnet-4-6", "--permission-mode", "plan", "--effort", "high"],
      cwd: null,
      env: [],
    });
  });

  test("resolves Codex yolo launch settings into the bypass flag", () => {
    const resolved = resolveTerminalLaunch(
      settings({
        profiles: {
          codex: {
            launcher: "codex",
            label: "Codex",
            settings: {
              model: "gpt-5.4",
              configProfile: "fast",
              approvalPolicy: "never",
              sandboxMode: "danger-full-access",
              reasoningEffort: "high",
              webSearch: "live",
            },
          },
        },
      }),
      "codex",
    );

    expect(resolved.kind).toBe("codex");
    expect(resolved.launchSpec).toEqual({
      program: "codex",
      args: [
        "--model",
        "gpt-5.4",
        "--profile",
        "fast",
        "--dangerously-bypass-approvals-and-sandbox",
        "--search",
      ],
      cwd: null,
      env: [],
    });
  });

  test("resolves Codex non-yolo launch settings into approval and sandbox flags", () => {
    const resolved = resolveTerminalLaunch(
      settings({
        profiles: {
          codex: {
            launcher: "codex",
            label: "Codex",
            settings: {
              model: null,
              configProfile: null,
              approvalPolicy: "on-request",
              sandboxMode: "workspace-write",
              reasoningEffort: null,
              webSearch: null,
            },
          },
        },
      }),
      "codex",
    );

    expect(resolved.kind).toBe("codex");
    expect(resolved.launchSpec).toEqual({
      program: "codex",
      args: ["--ask-for-approval", "on-request", "--sandbox", "workspace-write"],
      cwd: null,
      env: [],
    });
  });

  test("resolves OpenCode launch settings into an interactive CLI command", () => {
    const resolved = resolveTerminalLaunch(
      settings({
        profiles: {
          opencode: {
            launcher: "opencode",
            label: "OpenCode",
          },
        },
      }),
      "opencode",
    );

    expect(resolved.kind).toBe("opencode");
    expect(resolved.launchSpec).toEqual({
      program: "opencode",
      args: [],
      cwd: null,
      env: [],
    });
  });

  test("uses the configured default profile when no terminal kind is requested", () => {
    const resolved = resolveTerminalLaunch(
      settings({
        defaultProfile: "dev",
        profiles: {
          dev: {
            launcher: "command",
            label: "Dev",
            command: {
              program: "pnpm",
              args: ["dev"],
              env: {
                NODE_ENV: "development",
              },
            },
          },
        },
      }),
    );

    expect(resolved.kind).toBe("custom");
    expect(resolved.launchSpec).toEqual({
      program: "pnpm",
      args: ["dev"],
      cwd: null,
      env: [["NODE_ENV", "development"]],
    });
  });
});
