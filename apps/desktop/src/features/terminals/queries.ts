import type { TerminalRecord } from "@lifecycle/contracts";
import type { QueryDescriptor } from "@/query";

export const terminalKeys = {
  byWorkspace: (workspaceId: string) => ["workspace-terminals", workspaceId] as const,
  detail: (terminalId: string) => ["terminal", terminalId] as const,
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

export function createTerminalQuery(terminalId: string): QueryDescriptor<TerminalRecord | null> {
  return {
    key: terminalKeys.detail(terminalId),
    fetch(source) {
      return source.getTerminal(terminalId);
    },
  };
}
