import {
  createWorkspaceClientRegistry,
  type WorkspaceClientRegistry,
} from "@lifecycle/workspace";
import { LocalWorkspaceClient } from "@lifecycle/workspace/internal/local";

let registry: WorkspaceClientRegistry | null = null;

/**
 * Lazily create the CLI's WorkspaceClientRegistry.
 *
 * The CLI doesn't have Tauri, so most LocalWorkspaceClient methods
 * (readFile, openFile, etc.) will throw if called. Only methods that
 * don't need `invoke` — like `execCommand` — are safe to use.
 * This is fine: the CLI only uses the registry for host-dispatched
 * exec, not for the full desktop workspace UI surface.
 */
export function getWorkspaceClientRegistry(): WorkspaceClientRegistry {
  if (!registry) {
    const localClient = new LocalWorkspaceClient({
      invoke: async (cmd) => {
        throw new Error(
          `LocalWorkspaceClient.invoke("${cmd}") is not available in the CLI. ` +
          `Use execCommand() or a CLI-native code path instead.`,
        );
      },
    });

    registry = createWorkspaceClientRegistry({
      local: localClient,
      // cloud, docker, remote — register as they're implemented
    });
  }

  return registry;
}
