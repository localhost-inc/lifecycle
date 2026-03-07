import type { GitDiffScope, GitLogEntry, TerminalStatus } from "@lifecycle/contracts";
import { useEffect, useMemo, useReducer, useState } from "react";
import { useStoreClient } from "../../../store";
import { CommitDiffViewerPanel } from "../../git/components/commit-diff-viewer-panel";
import { DiffViewerPanel } from "../../git/components/diff-viewer-panel";
import {
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
  createTerminal,
  killTerminal,
  terminalHasLiveSession,
  type CreateTerminalRequest,
  type HarnessProvider,
} from "../../terminals/api";
import { TerminalLaunchActions } from "../../terminals/components/terminal-launch-actions";
import { TerminalPanel } from "../../terminals/components/terminal-panel";
import { TerminalStatusDot } from "../../terminals/components/terminal-status-dot";
import { terminalKeys, useWorkspaceTerminals } from "../../terminals/hooks";
import {
  commitDiffTabKey,
  createCommitDiffTab,
  createFileDiffTab,
  fileDiffTabKey,
  isCommitDiffDocument,
  isFileDiffDocument,
  readWorkspaceSurfaceState,
  type FileDiffDocument,
  type WorkspaceSurfaceDocument,
  type WorkspaceSurfaceState,
  writeWorkspaceSurfaceState,
} from "../state/workspace-surface-state";

interface FileDiffOpenRequest {
  filePath: string;
  id: string;
  kind: "file-diff";
  scope: GitDiffScope;
}

interface CommitDiffOpenRequest {
  commit: GitLogEntry;
  id: string;
  kind: "commit-diff";
}

type OpenDocumentRequest = FileDiffOpenRequest | CommitDiffOpenRequest;

interface WorkspaceSurfaceProps {
  openDocumentRequest: OpenDocumentRequest | null;
  workspaceId: string;
}

type RuntimeTab = {
  kind: "terminal";
  key: string;
  label: string;
  status: TerminalStatus;
  terminalId: string;
};

type WorkspaceSurfaceAction =
  | { type: "open-document"; request: OpenDocumentRequest }
  | { type: "change-scope"; key: string; scope: GitDiffScope }
  | { type: "update-diff-scope"; key: string; scope: GitDiffScope }
  | { type: "select-tab"; key: string | null }
  | { type: "close-document"; key: string }
  | { type: "sync-active"; key: string | null };

export function workspaceSurfaceReducer(
  state: WorkspaceSurfaceState,
  action: WorkspaceSurfaceAction,
): WorkspaceSurfaceState {
  switch (action.type) {
    case "open-document": {
      const request = action.request;

      if (request.kind === "file-diff") {
        const key = fileDiffTabKey(request.filePath);
        const existing = state.documents.find(
          (tab): tab is FileDiffDocument => isFileDiffDocument(tab) && tab.key === key,
        );

        if (existing) {
          return {
            activeTabKey: key,
            documents: state.documents.map((tab) =>
              tab.key === key && isFileDiffDocument(tab)
                ? { ...tab, activeScope: request.scope }
                : tab,
            ),
          };
        }

        return {
          activeTabKey: key,
          documents: [...state.documents, createFileDiffTab(request.filePath, request.scope)],
        };
      }

      const key = commitDiffTabKey(request.commit.sha);
      const nextTab = createCommitDiffTab(request.commit);
      const exists = state.documents.some((tab) => tab.key === key);

      return {
        activeTabKey: key,
        documents: exists
          ? state.documents.map((tab) => (tab.key === key ? nextTab : tab))
          : [...state.documents, nextTab],
      };
    }
    case "change-scope":
    case "update-diff-scope":
      return {
        ...state,
        documents: state.documents.map((tab) =>
          tab.key === action.key && isFileDiffDocument(tab)
            ? { ...tab, activeScope: action.scope }
            : tab,
        ),
      };
    case "select-tab":
    case "sync-active":
      return {
        ...state,
        activeTabKey: action.key,
      };
    case "close-document": {
      const documents = state.documents.filter((tab) => tab.key !== action.key);
      const activeTabKey = state.activeTabKey === action.key ? null : state.activeTabKey;
      return {
        activeTabKey,
        documents,
      };
    }
    default:
      return state;
  }
}

function releaseWebviewFocus(): void {
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
}

function tabLabel(tab: RuntimeTab | WorkspaceSurfaceDocument): string {
  return tab.label;
}

function tabTitle(tab: RuntimeTab | WorkspaceSurfaceDocument): string {
  if (tab.kind === "terminal") {
    return tab.label;
  }

  if (isFileDiffDocument(tab)) {
    return tab.filePath;
  }

  return `${tab.shortSha} ${tab.message}`;
}

function tabGlyph(tab: WorkspaceSurfaceDocument): string {
  return isCommitDiffDocument(tab) ? "#" : "Δ";
}

export function WorkspaceSurface({ openDocumentRequest, workspaceId }: WorkspaceSurfaceProps) {
  const client = useStoreClient();
  const terminalsQuery = useWorkspaceTerminals(workspaceId);
  const [creatingSelection, setCreatingSelection] = useState<"shell" | HarnessProvider | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [state, dispatch] = useReducer(
    workspaceSurfaceReducer,
    workspaceId,
    (initialWorkspaceId) => readWorkspaceSurfaceState(initialWorkspaceId),
  );

  const terminals = useMemo(
    () => (terminalsQuery.data ?? []).filter((terminal) => terminalHasLiveSession(terminal.status)),
    [terminalsQuery.data],
  );
  const runtimeTabs = useMemo<RuntimeTab[]>(
    () =>
      terminals.map((terminal) => ({
        kind: "terminal",
        key: `terminal:${terminal.id}`,
        label: terminal.label,
        status: terminal.status as TerminalStatus,
        terminalId: terminal.id,
      })),
    [terminals],
  );
  const allTabs = useMemo(
    () => [...runtimeTabs, ...state.documents],
    [runtimeTabs, state.documents],
  );

  useEffect(() => {
    if (!openDocumentRequest) {
      return;
    }

    dispatch({
      type: "open-document",
      request: openDocumentRequest,
    });
  }, [openDocumentRequest]);

  useEffect(() => {
    writeWorkspaceSurfaceState(workspaceId, state);
  }, [state, workspaceId]);

  useEffect(() => {
    if (allTabs.length === 0) {
      if (state.activeTabKey !== null) {
        dispatch({ type: "sync-active", key: null });
      }
      return;
    }

    if (!state.activeTabKey) {
      dispatch({ type: "sync-active", key: allTabs[0]?.key ?? null });
      return;
    }

    if (!allTabs.some((tab) => tab.key === state.activeTabKey)) {
      dispatch({ type: "sync-active", key: allTabs[0]?.key ?? null });
    }
  }, [allTabs, state.activeTabKey]);

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
      dispatch({ type: "select-tab", key: `terminal:${terminal.id}` });
    } catch (createError) {
      setError(String(createError));
    } finally {
      setCreatingSelection(null);
    }
  };

  const handleCloseTerminal = async (terminalId: string) => {
    try {
      await killTerminal(terminalId);
      client.invalidate(terminalKeys.byWorkspace(workspaceId));
    } catch (closeError) {
      setError(String(closeError));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-end border-b border-[var(--border)]">
        <div className="flex min-w-0 flex-1 items-end overflow-x-auto px-1">
          {allTabs.map((tab) => {
            const active = tab.key === state.activeTabKey;
            const isTerminal = tab.kind === "terminal";
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  releaseWebviewFocus();
                  dispatch({ type: "select-tab", key: tab.key });
                }}
                className={`group flex min-w-[160px] max-w-[260px] shrink-0 items-center gap-2 px-3 py-2 text-left text-sm transition ${
                  active
                    ? "font-medium text-[var(--foreground)]"
                    : "bg-[var(--panel)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
                title={tabTitle(tab)}
              >
                {isTerminal ? (
                  <TerminalStatusDot status={tab.status} />
                ) : (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[var(--border)] font-mono text-[10px] text-[var(--muted-foreground)]">
                    {tabGlyph(tab)}
                  </span>
                )}
                <span className="truncate">{tabLabel(tab)}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isTerminal) {
                      void handleCloseTerminal(tab.terminalId);
                      return;
                    }
                    dispatch({ type: "close-document", key: tab.key });
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") {
                      return;
                    }

                    event.stopPropagation();
                    if (isTerminal) {
                      void handleCloseTerminal(tab.terminalId);
                      return;
                    }
                    dispatch({ type: "close-document", key: tab.key });
                  }}
                  className="ml-auto shrink-0 rounded p-0.5 opacity-0 transition hover:bg-[var(--surface-hover)] group-hover:opacity-100"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <path d="M3 3l6 6M9 3l-6 6" />
                  </svg>
                </span>
              </button>
            );
          })}
        </div>
        <TerminalLaunchActions
          creatingSelection={creatingSelection}
          onCreateTerminal={(input) => {
            void handleCreateTerminal(input);
          }}
        />
      </div>

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

      {allTabs.length > 0 ? (
        <>
          {terminals.map((terminal) => {
            const key = `terminal:${terminal.id}`;
            const active = key === state.activeTabKey;

            return (
              <div key={terminal.id} className={active ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
                <TerminalPanel active={active} terminal={terminal} />
              </div>
            );
          })}

          {state.documents.map((tab) => {
            const active = tab.key === state.activeTabKey;

            return (
              <div key={tab.key} className={active ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
                {isFileDiffDocument(tab) ? (
                  <DiffViewerPanel
                    activeScope={tab.activeScope}
                    filePath={tab.filePath}
                    onScopeChange={(scope) => {
                      dispatch({ type: "change-scope", key: tab.key, scope });
                    }}
                    workspaceId={workspaceId}
                  />
                ) : isCommitDiffDocument(tab) ? (
                  <CommitDiffViewerPanel
                    commit={tab}
                    workspaceId={workspaceId}
                  />
                ) : null}
              </div>
            );
          })}
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center px-8 text-center">
          <div>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">No open tabs</h3>
            <p className="mt-2 max-w-md text-sm text-[var(--muted-foreground)]">
              Start a shell or harness session, or open a diff from the version control panel.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
