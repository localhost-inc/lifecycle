import { EmptyState } from "@lifecycle/ui";
import { useWorkspaceTerminals } from "@/features/terminals/hooks";
import { createTerminal, type CreateTerminalRequest } from "@/features/terminals/api";
import { TerminalSessionHistory } from "@/features/terminals/components/terminal-session-history";

interface SessionHistoryPanelProps {
  onFocusTerminal: (terminalId: string) => void;
  workspaceId: string;
}

export function SessionHistoryPanel({ onFocusTerminal, workspaceId }: SessionHistoryPanelProps) {
  const terminalsQuery = useWorkspaceTerminals(workspaceId);
  const terminals = terminalsQuery.data ?? [];

  function handleOpenTerminal(terminalId: string) {
    onFocusTerminal(terminalId);
  }

  function handleResumeTerminal(input: Extract<CreateTerminalRequest, { launchType: "harness" }>) {
    void createTerminal({ ...input, workspaceId });
  }

  return (
    <section className="flex min-h-0 h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 pt-2 pb-4">
        {terminals.length > 0 ? (
          <TerminalSessionHistory
            activeTerminalId={null}
            creatingSelection={null}
            onOpenTerminal={handleOpenTerminal}
            onResumeTerminal={handleResumeTerminal}
            terminals={terminals}
          />
        ) : (
          <div className="px-2.5 py-4">
            <EmptyState
              description="Terminal sessions for this workspace will appear here."
              size="sm"
              title="No sessions yet"
            />
          </div>
        )}
      </div>
    </section>
  );
}
