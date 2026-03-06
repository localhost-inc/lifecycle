import { useEffect, useState } from "react";
import { useStoreClient } from "../../../store";
import {
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
  type CreateTerminalRequest,
  type HarnessProvider,
  createTerminal,
  killTerminal,
  terminalHasLiveSession,
} from "../api";
import { terminalKeys, useWorkspaceTerminals } from "../hooks";
import { TerminalPanel } from "./terminal-panel";
import { TerminalTabs } from "./terminal-tabs";

interface TerminalWorkspaceSurfaceProps {
  workspaceId: string;
}

export function TerminalWorkspaceSurface({ workspaceId }: TerminalWorkspaceSurfaceProps) {
  const client = useStoreClient();
  const terminalsQuery = useWorkspaceTerminals(workspaceId);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [creatingSelection, setCreatingSelection] = useState<"shell" | HarnessProvider | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const terminals = (terminalsQuery.data ?? []).filter((terminal) =>
    terminalHasLiveSession(terminal.status),
  );
  const activeTerminal =
    terminals.find((terminal) => terminal.id === activeTerminalId) ?? terminals[0] ?? null;

  useEffect(() => {
    if (!activeTerminalId && terminals[0]) {
      setActiveTerminalId(terminals[0].id);
      return;
    }

    if (activeTerminalId && !terminals.some((terminal) => terminal.id === activeTerminalId)) {
      setActiveTerminalId(terminals[0]?.id ?? null);
    }
  }, [activeTerminalId, terminals]);

  const handleCloseTerminal = async (terminalId: string) => {
    try {
      await killTerminal(terminalId);
      client.invalidate(terminalKeys.byWorkspace(workspaceId));
    } catch (closeError) {
      setError(String(closeError));
    }
  };

  const handleCreateTerminal = async (input: CreateTerminalRequest) => {
    setCreatingSelection(input.launchType === "harness" ? input.harnessProvider : "shell");
    setError(null);

    try {
      const terminal = await createTerminal({
        cols: DEFAULT_TERMINAL_COLS,
        ...input,
        rows: DEFAULT_TERMINAL_ROWS,
        workspaceId,
      });
      client.invalidate(terminalKeys.byWorkspace(workspaceId));
      client.invalidate(terminalKeys.detail(terminal.id));
      setActiveTerminalId(terminal.id);
    } catch (createError) {
      setError(String(createError));
    } finally {
      setCreatingSelection(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <TerminalTabs
        activeTerminalId={activeTerminal?.id ?? null}
        creatingSelection={creatingSelection}
        onCloseTerminal={(terminalId) => {
          void handleCloseTerminal(terminalId);
        }}
        onCreateTerminal={(input) => {
          void handleCreateTerminal(input);
        }}
        onSelectTerminal={setActiveTerminalId}
        terminals={terminals}
      />
      {Boolean(terminalsQuery.error) && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Failed to load terminals: {String(terminalsQuery.error)}
        </div>
      )}
      {error && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {terminals.length > 0 ? (
        terminals.map((terminal) => (
          <div
            key={terminal.id}
            className={
              terminal.id === activeTerminal?.id
                ? "flex min-h-0 flex-1 flex-col"
                : "hidden"
            }
          >
            <TerminalPanel terminal={terminal} />
          </div>
        ))
      ) : (
        <div className="flex flex-1 items-center justify-center px-8 text-center">
          <div>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">No terminals</h3>
            <p className="mt-2 max-w-md text-sm text-[var(--muted-foreground)]">
              Click the + button above to start a shell or harness session.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
