import {
  createWorkspaceClientRegistry,
  type WorkspaceClientRegistry,
} from "@lifecycle/workspace";
import { access, readFile } from "node:fs/promises";
import { CloudWorkspaceClient } from "@lifecycle/workspace/internal/cloud";
import { LocalWorkspaceClient } from "@lifecycle/workspace/internal/local";
import { createControlPlaneClient } from "./control-plane-client";
import { invokeLocalWorkspaceCommand } from "./workspace/local-invoke";

let registry: WorkspaceClientRegistry | null = null;

/**
 * Lazily create the CLI's WorkspaceClientRegistry.
 *
 * The CLI doesn't have Tauri, so most LocalWorkspaceClient methods
 * (readFile, openFile, etc.) will throw if called. Only methods that
 * don't need `invoke` — like `execCommand` and `resolveShellRuntime` —
 * are safe to use.
 * This is fine: the CLI currently uses the registry for host-dispatched
 * shell exec, not for the full desktop workspace UI surface.
 */
export function getWorkspaceClientRegistry(): WorkspaceClientRegistry {
  if (!registry) {
    const localClient = new LocalWorkspaceClient({
      invoke: invokeLocalWorkspaceCommand,
      fileReader: {
        exists: async (path) => {
          try {
            await access(path);
            return true;
          } catch {
            return false;
          }
        },
        readTextFile: (path) => readFile(path, "utf8"),
      },
    });
    const cloudClient = new CloudWorkspaceClient({
      execWorkspaceCommand: async (workspaceId, command) => {
        const client = createControlPlaneClient();
        const res = await client.workspaces[":workspaceId"].exec.$post({
          param: { workspaceId },
          json: { command },
        });
        const result = await res.json();
        return {
          exitCode: result.exitCode ?? 1,
          stderr: result.stderr ?? "",
          stdout: result.stdout ?? "",
        };
      },
      getShellConnection: async (workspaceId) => {
        const client = createControlPlaneClient();
        const res = await client.workspaces[":workspaceId"].shell.$get({
          param: { workspaceId },
        });
        const result = await res.json();
        return {
          cwd: result.cwd,
          home: result.home,
          host: result.host,
          token: result.token,
        };
      },
    });

    registry = createWorkspaceClientRegistry({
      cloud: cloudClient,
      local: localClient,
      // cloud, docker, remote — register as they're implemented
    });
  }

  return registry;
}
