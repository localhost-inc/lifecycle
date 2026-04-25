import type { CliIo } from "@localhost-inc/cmd";
import { ensureBridge } from "@/bridge";

import { runOpenTUI } from "./opentui";
import { loadWorkspaceSelection } from "./selection-state";

function resolveInitialWorkspaceId(
  environment: NodeJS.ProcessEnv,
  explicitWorkspaceId?: string,
): Promise<string | null> | string | null {
  const preferredWorkspaceId = explicitWorkspaceId ?? environment.LIFECYCLE_INITIAL_WORKSPACE_ID;
  if (preferredWorkspaceId?.trim()) {
    return preferredWorkspaceId.trim();
  }
  return loadWorkspaceSelection();
}

export async function launchTui(
  input: {
    cwd?: string;
    env: NodeJS.ProcessEnv;
    workspaceId?: string;
  },
  io?: CliIo,
): Promise<number> {
  const stderr = io?.stderr ?? ((message: string) => console.error(message));

  try {
    if (input.cwd) {
      process.chdir(input.cwd);
    }

    const { client, port } = await ensureBridge();
    const bridgeUrl = `http://127.0.0.1:${port}`;
    process.env.LIFECYCLE_BRIDGE_URL = bridgeUrl;

    return await runOpenTUI({
      bridgeUrl,
      client,
      initialWorkspaceId: await resolveInitialWorkspaceId(input.env, input.workspaceId),
    });
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
