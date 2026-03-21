import type { TerminalRecord } from "@lifecycle/contracts";
import type { QueryDescriptor } from "@/query";

export const terminalKeys = {
  byWorkspace: (workspaceId: string) => ["workspace-terminals", workspaceId] as const,
};

export function createWorkspaceTerminalsQuery(
  workspaceId: string,
): QueryDescriptor<TerminalRecord[]> {
  return {
    key: terminalKeys.byWorkspace(workspaceId),
    fetch(source) {
      return source.listWorkspaceTerminals(workspaceId);
    },
  };
}
