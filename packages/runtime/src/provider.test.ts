import { describe, expect, test } from "bun:test";

import type { WorkspaceProvider, WorkspaceProviderCreateInput } from "./provider";
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
      "openTerminal",
      "exposePort",
    ];

    expect(requiredMethods).toHaveLength(10);
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
    expect(typeof provider.openTerminal).toBe("function");
    expect(typeof provider.exposePort).toBe("function");
  });

  test("cloud provider delegates the full contract surface", () => {
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
      openTerminal: async () => ({ terminalId: "term_1" }),
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
    expect(typeof provider.openTerminal).toBe("function");
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
});
