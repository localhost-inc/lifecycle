import { describe, expect, test } from "bun:test";

import type {
  WorkspaceProvider,
  WorkspaceProviderAttachTerminalResult,
  WorkspaceProviderCreateInput,
} from "./provider";
import { CloudWorkspaceProvider, type CloudWorkspaceClient } from "./workspaces/providers/cloud";
import { LocalWorkspaceProvider } from "./workspaces/providers/local";

describe("workspace provider interface", () => {
  test("defines the expected lifecycle method names", () => {
    const requiredMethods: Array<keyof WorkspaceProvider> = [
      "createWorkspace",
      "startServices",
      "healthCheck",
      "stopServices",
      "runSetup",
      "sleep",
      "wake",
      "destroy",
      "createTerminal",
      "attachTerminal",
      "writeTerminal",
      "resizeTerminal",
      "detachTerminal",
      "killTerminal",
      "exposePort",
    ];

    expect(requiredMethods).toHaveLength(15);
  });

  test("local provider exposes the full contract surface", () => {
    const invoke = async () => "";
    const provider = new LocalWorkspaceProvider(invoke);
    expect(typeof provider.createWorkspace).toBe("function");
    expect(typeof provider.startServices).toBe("function");
    expect(typeof provider.healthCheck).toBe("function");
    expect(typeof provider.stopServices).toBe("function");
    expect(typeof provider.runSetup).toBe("function");
    expect(typeof provider.sleep).toBe("function");
    expect(typeof provider.wake).toBe("function");
    expect(typeof provider.destroy).toBe("function");
    expect(typeof provider.createTerminal).toBe("function");
    expect(typeof provider.attachTerminal).toBe("function");
    expect(typeof provider.writeTerminal).toBe("function");
    expect(typeof provider.resizeTerminal).toBe("function");
    expect(typeof provider.detachTerminal).toBe("function");
    expect(typeof provider.killTerminal).toBe("function");
    expect(typeof provider.exposePort).toBe("function");
  });

  test("cloud provider delegates the full contract surface", () => {
    const terminalResult: WorkspaceProviderAttachTerminalResult = {
      replayCursor: null,
      terminal: {
        id: "term_1",
        label: "Terminal 1",
        lastActiveAt: "2026-03-05T08:00:00.000Z",
        launchType: "shell",
        startedAt: "2026-03-05T08:00:00.000Z",
        status: "active",
        workspaceId: "ws_1",
      },
    };
    const client: CloudWorkspaceClient = {
      createWorkspace: async () => {
        throw new Error("not used");
      },
      startServices: async () => [],
      healthCheck: async () => ({ healthy: false, services: [] }),
      stopServices: async () => {},
      runSetup: async () => {},
      sleep: async () => {},
      wake: async () => {},
      destroy: async () => {},
      createTerminal: async () => terminalResult,
      attachTerminal: async () => terminalResult,
      writeTerminal: async () => {},
      resizeTerminal: async () => {},
      detachTerminal: async () => {},
      killTerminal: async () => {},
      exposePort: async () => null,
    };
    const provider = new CloudWorkspaceProvider(client);
    expect(typeof provider.createWorkspace).toBe("function");
    expect(typeof provider.startServices).toBe("function");
    expect(typeof provider.healthCheck).toBe("function");
    expect(typeof provider.stopServices).toBe("function");
    expect(typeof provider.runSetup).toBe("function");
    expect(typeof provider.sleep).toBe("function");
    expect(typeof provider.wake).toBe("function");
    expect(typeof provider.destroy).toBe("function");
    expect(typeof provider.createTerminal).toBe("function");
    expect(typeof provider.attachTerminal).toBe("function");
    expect(typeof provider.writeTerminal).toBe("function");
    expect(typeof provider.resizeTerminal).toBe("function");
    expect(typeof provider.detachTerminal).toBe("function");
    expect(typeof provider.killTerminal).toBe("function");
    expect(typeof provider.exposePort).toBe("function");
  });

  test("create input supports provider-specific context via mode discriminator", () => {
    const localInput: WorkspaceProviderCreateInput = {
      workspaceId: "ws_local_1",
      sourceRef: "lifecycle/local-1",
      manifestPath: "/tmp/lifecycle.json",
      resolvedSecrets: {},
      context: {
        mode: "local",
        projectId: "project_1",
        projectPath: "/tmp/project_1",
      },
    };

    const cloudInput: WorkspaceProviderCreateInput = {
      workspaceId: "ws_cloud_1",
      sourceRef: "feature/cloud-1",
      manifestPath: "/tmp/lifecycle.json",
      resolvedSecrets: {},
      context: {
        mode: "cloud",
        organizationId: "org_1",
        repositoryId: "repo_1",
        projectId: "project_1",
      },
    };

    expect(localInput.context.mode).toBe("local");
    expect(cloudInput.context.mode).toBe("cloud");
  });

  test("local provider rejects cloud create context", async () => {
    const invoke = async () => "";
    const provider = new LocalWorkspaceProvider(invoke);

    await expect(
      provider.createWorkspace({
        workspaceId: "ws_cloud_1",
        sourceRef: "feature/cloud-1",
        manifestPath: "/tmp/lifecycle.json",
        resolvedSecrets: {},
        context: {
          mode: "cloud",
          organizationId: "org_1",
          repositoryId: "repo_1",
          projectId: "project_1",
        },
      }),
    ).rejects.toThrow("LocalWorkspaceProvider requires context.mode='local'");
  });

  test("local provider forwards optional terminal resume session ids", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      if (args) {
        calls.push({ cmd, args });
      } else {
        calls.push({ cmd });
      }
      return {
        replayCursor: null,
        terminal: {
          harnessProvider: "claude",
          harnessSessionId: "session-123",
          id: "term_1",
          label: "Claude · Session 1",
          lastActiveAt: "2026-03-05T08:00:00.000Z",
          launchType: "harness",
          startedAt: "2026-03-05T08:00:00.000Z",
          status: "detached",
          workspaceId: "ws_1",
        },
      };
    };
    const provider = new LocalWorkspaceProvider(invoke);

    await provider.createTerminal({
      workspaceId: "ws_1",
      launchType: "harness",
      harnessProvider: "claude",
      harnessSessionId: "session-123",
      cols: 120,
      rows: 32,
    });

    expect(calls).toEqual([
      {
        cmd: "create_terminal",
        args: {
          workspaceId: "ws_1",
          launchType: "harness",
          harnessProvider: "claude",
          harnessSessionId: "session-123",
          cols: 120,
          rows: 32,
        },
      },
    ]);
  });
});
