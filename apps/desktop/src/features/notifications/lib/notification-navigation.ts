/**
 * Module-level store for pending terminal focus requests from notification clicks.
 *
 * When a notification is clicked, we navigate to the workspace route and set a
 * pending focus. The workspace canvas controller consumes it on mount to select
 * the correct terminal tab — this avoids a race with lazy-loaded route components.
 */

interface PendingTerminalFocus {
  terminalId: string;
  workspaceId: string;
}

let pendingFocus: PendingTerminalFocus | null = null;

export function setPendingTerminalFocus(workspaceId: string, terminalId: string): void {
  pendingFocus = { terminalId, workspaceId };
}

export function consumePendingTerminalFocus(workspaceId: string): string | null {
  if (pendingFocus && pendingFocus.workspaceId === workspaceId) {
    const { terminalId } = pendingFocus;
    pendingFocus = null;
    return terminalId;
  }

  return null;
}
