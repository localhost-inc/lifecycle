import { Alert, AlertDescription, AlertTitle } from "@lifecycle/ui";
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

  const releaseWebviewFocus = () => {
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
  };

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
    releaseWebviewFocus();

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
        onSelectTerminal={(terminalId) => {
          releaseWebviewFocus();
          setActiveTerminalId(terminalId);
        }}
        terminals={terminals}
      />
      {Boolean(terminalsQuery.error) && (
        <Alert className="border-x-0 border-t-0" variant="destructive">
          <AlertTitle>Failed to load terminals</AlertTitle>
          <AlertDescription>{String(terminalsQuery.error)}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert className="border-x-0 border-t-0" variant="destructive">
          <AlertTitle>Terminal error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {terminals.length > 0 ? (
        terminals.map((terminal) => (
          <div
            key={terminal.id}
            className={
              terminal.id === activeTerminal?.id ? "flex min-h-0 flex-1 flex-col" : "hidden"
            }
          >
            <TerminalPanel active={terminal.id === activeTerminal?.id} terminal={terminal} />
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
