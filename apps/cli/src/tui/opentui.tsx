import { spawn, type IPty } from "bun-pty";
import type { IExitEvent } from "bun-pty";
import {
  CliRenderEvents,
  createCliRenderer,
  type PasteEvent,
  type ScrollBoxRenderable,
} from "@opentui/core";
import {
  createRoot,
  extend,
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import { GhosttyTerminalRenderable } from "ghostty-opentui/terminal-buffer";
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { BridgeClient } from "@/bridge";

import { RepositorySidebar } from "./components/repository-sidebar";
import { WorkspaceExtensionSidebar } from "./components/workspace-extension-sidebar";
import { WorkspaceHeader } from "./components/workspace-header";
import { WorkspaceSessionStrip } from "./components/workspace-session-strip";
import { WorkspaceShellPanel } from "./components/workspace-shell-panel";
import {
  createVisibleSidebarEntries,
  describeShellExit,
  formatTuiFatalError,
  flattenWorkspaceGroups,
  groupRepositoryWorkspaces,
  isTuiQuitKey,
  mergeLaunchEnvironment,
  pickSidebarEntryKey,
  pickTerminalId,
  pickWorkspaceId,
  repositorySidebarEntryKey,
  type RepositoryWorkspaceGroup,
  type SidebarEntry,
  workspaceShortLabel,
  workspaceSidebarEntryKey,
} from "./opentui-helpers";
import { saveWorkspaceSelection } from "./selection-state";
import { defaultTuiTheme, deriveTuiTheme, type TuiTheme } from "./tui-theme";
import type {
  FocusTarget,
  RepositoriesResponse,
  WorkspaceCreatedTerminalEnvelope,
  WorkspaceDetailResponse,
  WorkspaceExtensionKind,
  WorkspaceShellLaunchSpec,
  WorkspaceTerminalConnectionEnvelope,
  WorkspaceTerminalRecord,
  WorkspaceTerminalsEnvelope,
} from "./tui-models";

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "ghostty-terminal": typeof GhosttyTerminalRenderable;
  }
}

extend({ "ghostty-terminal": GhosttyTerminalRenderable });

const SIDEBAR_WIDTH = 32;
const EXTENSION_WIDTH = 34;
const BODY_HEIGHT_OVERHEAD = 8;
const BODY_WIDTH_OVERHEAD = 4;
const MIN_CANVAS_COLS = 40;
const MIN_CANVAS_ROWS = 12;
const REFRESH_INTERVAL_MS = 10_000;
const TUI_TITLE = "Lifecycle";

interface ActiveTerminalConnection {
  connectionId: string;
  terminalId: string;
  workspaceId: string;
}

type RefreshReason = "initial" | "manual" | "poll";

export async function runOpenTUI(input: {
  client: BridgeClient;
  initialWorkspaceId: string | null;
}): Promise<number> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    openConsoleOnError: false,
    screenMode: "alternate-screen",
    useKittyKeyboard: {
      alternateKeys: true,
      disambiguate: true,
      events: true,
    },
    useMouse: true,
  } as any);

  let exiting = false;
  const root = createRoot(renderer);
  const requestExit = () => {
    if (exiting) {
      return;
    }
    exiting = true;
    renderer.destroy();
  };
  const globalKeypressListener = (key: { ctrl?: boolean; name?: string | null }) => {
    if (isTuiQuitKey(key)) {
      requestExit();
    }
  };
  const processSigintListener = () => {
    requestExit();
  };

  renderer.setTerminalTitle(TUI_TITLE);
  renderer.keyInput.on("keypress", globalKeypressListener);
  process.on("SIGINT", processSigintListener);

  root.render(
    <FatalTuiBoundary>
      <App client={input.client} initialWorkspaceId={input.initialWorkspaceId} />
    </FatalTuiBoundary>,
  );

  await renderer.idle();
  return await new Promise<number>((resolve) => {
    renderer.once(CliRenderEvents.DESTROY, () => {
      renderer.keyInput.off("keypress", globalKeypressListener);
      process.off("SIGINT", processSigintListener);
      resolve(0);
    });
  });
}

interface FatalTuiBoundaryState {
  error: Error | null;
}

class FatalTuiBoundary extends Component<{ children: ReactNode }, FatalTuiBoundaryState> {
  state: FatalTuiBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): FatalTuiBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <FatalTuiScreen error={this.state.error} />;
    }

    return this.props.children;
  }
}

function FatalTuiScreen(props: { error: Error }) {
  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        paddingLeft: 2,
        paddingRight: 2,
        paddingTop: 1,
      }}
    >
      <text fg={defaultTuiTheme.state.danger}>Lifecycle TUI crashed.</text>
      <text fg={defaultTuiTheme.mutedForeground}>Press Ctrl+Q to quit.</text>
      <box style={{ marginTop: 1 }}>
        <text fg={defaultTuiTheme.foreground}>{formatTuiFatalError(props.error)}</text>
      </box>
    </box>
  );
}

function App(props: { client: BridgeClient; initialWorkspaceId: string | null }) {
  const renderer = useRenderer();
  const { height, width } = useTerminalDimensions();
  const terminalScrollRef = useRef<ScrollBoxRenderable | null>(null);
  const scrollTerminalToBottomRef = useRef(false);
  const ptyRef = useRef<IPty | null>(null);
  const ptySubscriptionsRef = useRef<Array<{ dispose: () => void }>>([]);
  const shellRunIdRef = useRef(0);
  const canvasSizeRef = useRef({ cols: MIN_CANVAS_COLS, rows: MIN_CANVAS_ROWS });
  const activeConnectionRef = useRef<ActiveTerminalConnection | null>(null);
  const [theme, setTheme] = useState<TuiTheme>(defaultTuiTheme);
  const [focus, setFocus] = useState<FocusTarget>("canvas");
  const [loading, setLoading] = useState(true);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [repositoryGroups, setRepositoryGroups] = useState<RepositoryWorkspaceGroup[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    props.initialWorkspaceId,
  );
  const [sidebarSelectionKey, setSidebarSelectionKey] = useState<string | null>(
    props.initialWorkspaceId ? workspaceSidebarEntryKey(props.initialWorkspaceId) : null,
  );
  const [collapsedRepositoryIds, setCollapsedRepositoryIds] = useState<string[]>([]);
  const [workspaceDetail, setWorkspaceDetail] = useState<WorkspaceDetailResponse | null>(null);
  const [terminalsEnvelope, setTerminalsEnvelope] = useState<WorkspaceTerminalsEnvelope | null>(
    null,
  );
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [selectedExtension, setSelectedExtension] = useState<WorkspaceExtensionKind>("stack");
  const [workspaceListError, setWorkspaceListError] = useState<string | null>(null);
  const [shellError, setShellError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePromptOpen, setDeletePromptOpen] = useState(false);
  const [stackActionBusy, setStackActionBusy] = useState<"start" | "stop" | null>(null);
  const [terminalAnsi, setTerminalAnsi] = useState("");
  const [, setShellStatus] = useState("Idle");

  const sidebarWidth = width >= 120 ? SIDEBAR_WIDTH : 24;
  const extensionWidth = width >= 150 ? EXTENSION_WIDTH : width >= 120 ? 30 : 26;
  const canvasCols = Math.max(
    MIN_CANVAS_COLS,
    width - sidebarWidth - extensionWidth - BODY_WIDTH_OVERHEAD,
  );
  const canvasRows = Math.max(MIN_CANVAS_ROWS, height - BODY_HEIGHT_OVERHEAD);
  const terminalRenderRows = useMemo(
    () => estimateTerminalRenderRows(terminalAnsi, canvasRows),
    [canvasRows, terminalAnsi],
  );
  const workspaces = useMemo(() => flattenWorkspaceGroups(repositoryGroups), [repositoryGroups]);
  const collapsedRepositoryIdSet = useMemo(
    () => new Set(collapsedRepositoryIds),
    [collapsedRepositoryIds],
  );
  const sidebarEntries = useMemo(
    () =>
      createVisibleSidebarEntries(repositoryGroups, collapsedRepositoryIdSet, selectedWorkspaceId),
    [collapsedRepositoryIdSet, repositoryGroups, selectedWorkspaceId],
  );
  const terminals = useMemo(() => terminalsEnvelope?.terminals ?? [], [terminalsEnvelope]);
  const runtime = terminalsEnvelope?.runtime ?? null;

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces],
  );
  const selectedSidebarEntry = useMemo(
    () => sidebarEntries.find((entry) => entry.key === sidebarSelectionKey) ?? null,
    [sidebarEntries, sidebarSelectionKey],
  );

  useEffect(() => {
    let cancelled = false;

    void renderer
      .getPalette({ size: 16 })
      .then((palette) => {
        if (cancelled) {
          return;
        }

        setTheme(deriveTuiTheme(palette));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [renderer]);

  const focusRepository = useCallback((repositoryId: string) => {
    setSidebarSelectionKey(repositorySidebarEntryKey(repositoryId));
    setFocus("sidebar");
  }, []);

  const collapseRepository = useCallback((repositoryId: string) => {
    setCollapsedRepositoryIds((current) =>
      current.includes(repositoryId) ? current : current.concat(repositoryId),
    );
  }, []);

  const expandRepository = useCallback((repositoryId: string) => {
    setCollapsedRepositoryIds((current) =>
      current.filter((candidateRepositoryId) => candidateRepositoryId !== repositoryId),
    );
  }, []);

  const toggleRepository = useCallback((repositoryId: string) => {
    setCollapsedRepositoryIds((current) =>
      current.includes(repositoryId)
        ? current.filter((candidateRepositoryId) => candidateRepositoryId !== repositoryId)
        : current.concat(repositoryId),
    );
  }, []);

  const focusWorkspace = useCallback((workspaceId: string, nextFocus: FocusTarget) => {
    setSidebarSelectionKey(workspaceSidebarEntryKey(workspaceId));
    setSelectedWorkspaceId(workspaceId);
    setFocus(nextFocus);
  }, []);

  const disconnectActiveConnection = useCallback(async () => {
    const connection = activeConnectionRef.current;
    activeConnectionRef.current = null;
    if (!connection) {
      return;
    }

    try {
      await props.client.workspaces[":id"].terminals[":terminalId"].connections[
        ":connectionId"
      ].$delete({
        param: {
          connectionId: connection.connectionId,
          id: connection.workspaceId,
          terminalId: connection.terminalId,
        },
      });
    } catch {
      // Best-effort cleanup. A stale tmux attach session should not block TUI shutdown.
    }
  }, [props.client]);

  const detachActivePty = useCallback((message = "Detached.") => {
    for (const subscription of ptySubscriptionsRef.current) {
      subscription.dispose();
    }
    ptySubscriptionsRef.current = [];

    const pty = ptyRef.current;
    ptyRef.current = null;
    if (pty) {
      try {
        pty.kill();
      } catch {
        // PTY teardown is best-effort.
      }
    }

    scrollTerminalToBottomRef.current = false;
    setTerminalAnsi("");
    setShellStatus(message);
  }, []);

  const shutdownActiveShell = useCallback(
    (message = "Detached.") => {
      detachActivePty(message);
      void disconnectActiveConnection();
    },
    [detachActivePty, disconnectActiveConnection],
  );

  const exitTui = useCallback(() => {
    shutdownActiveShell("Detached.");
    renderer.destroy();
  }, [renderer, shutdownActiveShell]);

  const refreshWorkspaces = useCallback(
    async (reason: RefreshReason, preferredWorkspaceId: string | null = selectedWorkspaceId) => {
      if (reason === "initial") {
        setLoading(true);
      }

      try {
        const response = await props.client.repos.$get();
        const payload = (await response.json()) as RepositoriesResponse;
        const normalizedGroups = groupRepositoryWorkspaces(payload.repositories);
        const normalizedWorkspaces = flattenWorkspaceGroups(normalizedGroups);
        setRepositoryGroups(normalizedGroups);
        setCollapsedRepositoryIds((current) =>
          current.filter((repositoryId) =>
            normalizedGroups.some((group) => group.id === repositoryId),
          ),
        );
        setWorkspaceListError(null);
        setSelectedWorkspaceId(pickWorkspaceId(normalizedWorkspaces, preferredWorkspaceId));
      } catch (error) {
        setWorkspaceListError(error instanceof Error ? error.message : String(error));
      } finally {
        if (reason === "initial") {
          setLoading(false);
        }
      }
    },
    [props.client, selectedWorkspaceId],
  );

  const createTerminal = useCallback(
    async (workspaceId: string) => {
      setShellStatus("Creating terminal...");
      setShellError(null);

      try {
        const response = await props.client.workspaces[":id"].terminals.$post({
          json: { kind: "shell" },
          param: { id: workspaceId },
        });
        const created = (await response.json()) as WorkspaceCreatedTerminalEnvelope;

        setTerminalsEnvelope((current) => {
          const nextTerminals = upsertTerminalRecord(current?.terminals ?? [], created.terminal);
          return {
            runtime: created.runtime,
            terminals: nextTerminals,
            workspace: created.workspace,
          };
        });
        setActiveTerminalId(created.terminal.id);
        setFocus("canvas");

        return created.terminal;
      } catch (error) {
        setShellError(error instanceof Error ? error.message : String(error));
        setShellStatus("Unavailable");
        return null;
      }
    },
    [props.client],
  );

  const loadWorkspaceScene = useCallback(
    async (workspaceId: string, reason: RefreshReason) => {
      if (reason !== "poll") {
        setSceneLoading(true);
      }

      try {
        const [detailResponse, terminalsResponse] = await Promise.all([
          props.client.workspaces[":id"].$get({ param: { id: workspaceId } }),
          props.client.workspaces[":id"].terminals.$get({ param: { id: workspaceId } }),
        ]);

        const nextDetail = (await detailResponse.json()) as WorkspaceDetailResponse;
        const nextTerminals = (await terminalsResponse.json()) as WorkspaceTerminalsEnvelope;
        const nextActiveTerminalId = pickTerminalId(nextTerminals.terminals, null);

        setWorkspaceDetail(nextDetail);
        setTerminalsEnvelope(nextTerminals);
        setActiveTerminalId((current) => pickTerminalId(nextTerminals.terminals, current));

        if (
          reason !== "poll" &&
          !nextActiveTerminalId &&
          nextTerminals.runtime.supports_create !== false
        ) {
          await createTerminal(workspaceId);
        }
      } catch (error) {
        setWorkspaceDetail(null);
        setTerminalsEnvelope(null);
        setActiveTerminalId(null);
        setShellError(error instanceof Error ? error.message : String(error));
        setShellStatus("Unavailable");
      } finally {
        if (reason !== "poll") {
          setSceneLoading(false);
        }
      }
    },
    [createTerminal, props.client],
  );

  const connectTerminal = useCallback(
    async (workspaceId: string, terminalId: string) => {
      const runId = ++shellRunIdRef.current;

      detachActivePty("Connecting...");
      await disconnectActiveConnection();
      setShellError(null);

      try {
        const response = await props.client.workspaces[":id"].terminals[
          ":terminalId"
        ].connections.$post({
          json: {
            access: "interactive",
            clientId: crypto.randomUUID(),
            preferredTransport: "spawn",
          },
          param: { id: workspaceId, terminalId },
        });

        if (runId !== shellRunIdRef.current) {
          return;
        }

        const nextConnection = (await response.json()) as WorkspaceTerminalConnectionEnvelope;
        const transport = nextConnection.connection.transport;
        if (
          nextConnection.connection.launch_error ||
          !transport ||
          transport.kind !== "spawn" ||
          !transport.spec
        ) {
          setShellError(
            nextConnection.connection.launch_error ??
              "Lifecycle could not resolve a spawnable terminal transport.",
          );
          setShellStatus("Connection failed");
          return;
        }

        activeConnectionRef.current = {
          connectionId: nextConnection.connection.connection_id,
          terminalId: nextConnection.connection.terminal_id,
          workspaceId,
        };

        if (transport.prepare) {
          setShellStatus("Preparing terminal...");
          const prepareExitCode = await runLaunchSpec(transport.prepare);
          if (runId !== shellRunIdRef.current) {
            return;
          }
          if (prepareExitCode !== 0) {
            void disconnectActiveConnection();
            setShellError(`Terminal prepare step failed with exit code ${prepareExitCode}.`);
            setShellStatus("Prepare failed");
            return;
          }
        }

        scrollTerminalToBottomRef.current = true;
        setTerminalAnsi(nextConnection.connection.initial_ansi ?? "");
        setShellStatus("Attaching...");

        const pty = spawn(resolveLaunchProgram(transport.spec.program), transport.spec.args, {
          cols: canvasSizeRef.current.cols,
          env: mergeLaunchEnvironment(process.env, transport.spec.env),
          name: "xterm-256color",
          rows: canvasSizeRef.current.rows,
          ...(transport.spec.cwd !== null ? { cwd: transport.spec.cwd } : {}),
        });

        const onData = pty.onData((data) => {
          if (runId !== shellRunIdRef.current) {
            return;
          }
          setTerminalAnsi((current) => current + data);
        });

        const onExit = pty.onExit((event: IExitEvent) => {
          if (runId !== shellRunIdRef.current) {
            return;
          }
          ptyRef.current = null;
          ptySubscriptionsRef.current = [];
          setShellStatus(describeShellExit(event.exitCode, event.signal));
          void disconnectActiveConnection();
        });

        ptySubscriptionsRef.current = [onData, onExit];
        ptyRef.current = pty;
        setShellStatus("Attached");
        setFocus("canvas");
      } catch (error) {
        if (runId !== shellRunIdRef.current) {
          return;
        }
        setShellError(error instanceof Error ? error.message : String(error));
        setShellStatus("Connection failed");
      }
    },
    [detachActivePty, disconnectActiveConnection, props.client],
  );

  const handleRefresh = useCallback(
    (reason: Extract<RefreshReason, "manual" | "poll">) => {
      void refreshWorkspaces(reason);
      if (selectedWorkspaceId) {
        void loadWorkspaceScene(selectedWorkspaceId, reason);
      }
    },
    [loadWorkspaceScene, refreshWorkspaces, selectedWorkspaceId],
  );

  const toggleWorkspaceStack = useCallback(async () => {
    if (
      !selectedWorkspaceId ||
      !selectedWorkspace ||
      selectedWorkspace.host !== "local" ||
      workspaceDetail?.stack.state !== "ready" ||
      stackActionBusy
    ) {
      return;
    }

    const nextAction = hasActiveStackServices(workspaceDetail) ? "stop" : "start";
    setStackActionBusy(nextAction);

    try {
      if (nextAction === "start") {
        await props.client.workspaces[":id"].stack.start.$post({
          json: {},
          param: { id: selectedWorkspaceId },
        });
      } else {
        await props.client.workspaces[":id"].stack.stop.$post({
          json: {},
          param: { id: selectedWorkspaceId },
        });
      }

      await loadWorkspaceScene(selectedWorkspaceId, "manual");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSelectedExtension("stack");
      setWorkspaceDetail((current) =>
        current
          ? {
              ...current,
              stack: {
                ...current.stack,
                errors: current.stack.errors.includes(message)
                  ? current.stack.errors
                  : [message, ...current.stack.errors],
              },
            }
          : current,
      );
    } finally {
      setStackActionBusy(null);
    }
  }, [
    loadWorkspaceScene,
    props.client,
    selectedWorkspace,
    selectedWorkspaceId,
    stackActionBusy,
    workspaceDetail,
  ]);

  const requestDeleteWorkspace = useCallback(() => {
    if (!selectedWorkspaceId || deleteBusy) {
      return;
    }

    setDeleteError(null);
    setDeletePromptOpen(true);
  }, [deleteBusy, selectedWorkspaceId]);

  const cancelDeleteWorkspace = useCallback(() => {
    if (deleteBusy) {
      return;
    }

    setDeleteError(null);
    setDeletePromptOpen(false);
  }, [deleteBusy]);

  const deleteWorkspace = useCallback(
    async (force: boolean) => {
      if (!selectedWorkspaceId || deleteBusy) {
        return;
      }

      setDeleteBusy(true);
      setDeleteError(null);

      try {
        await props.client.workspaces[":id"].$delete({
          param: { id: selectedWorkspaceId },
          query: force ? { force: "true" } : {},
        });

        shellRunIdRef.current += 1;
        setDeletePromptOpen(false);
        setSidebarSelectionKey(null);
        setSelectedWorkspaceId(null);
        setWorkspaceDetail(null);
        setTerminalsEnvelope(null);
        setActiveTerminalId(null);
        setShellError(null);
        shutdownActiveShell("Workspace deleted.");
        await refreshWorkspaces("manual", null);
      } catch (error) {
        setDeleteError(error instanceof Error ? error.message : String(error));
      } finally {
        setDeleteBusy(false);
      }
    },
    [deleteBusy, props.client, refreshWorkspaces, selectedWorkspaceId, shutdownActiveShell],
  );

  useEffect(() => {
    void refreshWorkspaces("initial");
    const interval = setInterval(() => {
      handleRefresh("poll");
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [handleRefresh, refreshWorkspaces]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      shellRunIdRef.current += 1;
      setWorkspaceDetail(null);
      setTerminalsEnvelope(null);
      setActiveTerminalId(null);
      setShellError(null);
      shutdownActiveShell("No workspace selected.");
      return;
    }

    setSceneLoading(true);
    setWorkspaceDetail(null);
    setTerminalsEnvelope(null);
    setActiveTerminalId(null);
    setShellError(null);
    setSelectedExtension("stack");
    void loadWorkspaceScene(selectedWorkspaceId, "initial");
  }, [loadWorkspaceScene, selectedWorkspaceId, shutdownActiveShell]);

  useEffect(() => {
    if (!selectedWorkspaceId || sceneLoading) {
      return;
    }

    if (!activeTerminalId) {
      shellRunIdRef.current += 1;
      shutdownActiveShell(runtime?.launch_error ? "Unavailable" : "No open tabs");
      return;
    }

    void connectTerminal(selectedWorkspaceId, activeTerminalId);
  }, [
    activeTerminalId,
    connectTerminal,
    runtime?.launch_error,
    sceneLoading,
    selectedWorkspaceId,
    shutdownActiveShell,
  ]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }
    void saveWorkspaceSelection(selectedWorkspaceId).catch(() => undefined);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    setDeleteError(null);
    setDeletePromptOpen(false);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    setSidebarSelectionKey((current) =>
      pickSidebarEntryKey(sidebarEntries, current, selectedWorkspaceId),
    );
  }, [selectedWorkspaceId, sidebarEntries]);

  useEffect(() => {
    canvasSizeRef.current = { cols: canvasCols, rows: canvasRows };
    ptyRef.current?.resize(canvasCols, canvasRows);
  }, [canvasCols, canvasRows]);

  useEffect(() => {
    if (!scrollTerminalToBottomRef.current || !terminalScrollRef.current) {
      return;
    }

    terminalScrollRef.current.scrollTo(terminalScrollRef.current.scrollHeight);
    scrollTerminalToBottomRef.current = false;
  }, [terminalAnsi]);

  useEffect(
    () => () => {
      shutdownActiveShell("Detached.");
    },
    [shutdownActiveShell],
  );

  const handlePaste = useCallback(
    (event: PasteEvent) => {
      if (focus !== "canvas" || !ptyRef.current) {
        return;
      }
      ptyRef.current.write(new TextDecoder().decode(event.bytes));
      event.preventDefault();
      event.stopPropagation();
    },
    [focus],
  );

  useEffect(() => {
    const listener = (event: PasteEvent) => handlePaste(event);
    renderer.keyInput.on("paste", listener);
    return () => {
      renderer.keyInput.off("paste", listener);
    };
  }, [handlePaste, renderer]);

  const cycleExtension = useCallback((delta: -1 | 1) => {
    setSelectedExtension((current) => {
      const options: WorkspaceExtensionKind[] = ["stack", "debug"];
      const currentIndex = Math.max(0, options.indexOf(current));
      const nextIndex = (currentIndex + delta + options.length) % options.length;
      return options[nextIndex] ?? current;
    });
  }, []);

  useKeyboard((key) => {
    if (isTuiQuitKey(key)) {
      key.preventDefault();
      exitTui();
      key.stopPropagation();
      return;
    }

    if (key.ctrl && key.name === "t") {
      key.preventDefault();
      if (selectedWorkspaceId && runtime?.supports_create !== false) {
        void createTerminal(selectedWorkspaceId);
      }
      return;
    }

    if (focus === "canvas" && terminalScrollRef.current) {
      if (key.shift && key.name === "pageup") {
        key.preventDefault();
        terminalScrollRef.current.scrollBy(-1 / 2, "viewport");
        key.stopPropagation();
        return;
      }

      if (key.shift && key.name === "pagedown") {
        key.preventDefault();
        terminalScrollRef.current.scrollBy(1 / 2, "viewport");
        key.stopPropagation();
        return;
      }

      if (key.shift && key.name === "up") {
        key.preventDefault();
        terminalScrollRef.current.scrollBy(-1, "content");
        key.stopPropagation();
        return;
      }

      if (key.shift && key.name === "down") {
        key.preventDefault();
        terminalScrollRef.current.scrollBy(1, "content");
        key.stopPropagation();
        return;
      }

      if (key.shift && key.name === "home") {
        key.preventDefault();
        terminalScrollRef.current.scrollTo(0);
        key.stopPropagation();
        return;
      }

      if (key.shift && key.name === "end") {
        key.preventDefault();
        terminalScrollRef.current.scrollTo(terminalScrollRef.current.scrollHeight);
        key.stopPropagation();
        return;
      }
    }

    if (key.name === "f1") {
      key.preventDefault();
      setFocus("sidebar");
      return;
    }

    if (key.name === "f2") {
      key.preventDefault();
      setFocus("canvas");
      return;
    }

    if (key.name === "f3") {
      key.preventDefault();
      setFocus("extensions");
      return;
    }

    if (key.name === "f5") {
      key.preventDefault();
      handleRefresh("manual");
      return;
    }

    if (deletePromptOpen) {
      if (key.name === "escape") {
        key.preventDefault();
        cancelDeleteWorkspace();
        return;
      }

      if (key.name === "return") {
        key.preventDefault();
        void deleteWorkspace(false);
        return;
      }

      if (!key.ctrl && !key.meta && !key.shift && key.name === "f") {
        key.preventDefault();
        void deleteWorkspace(true);
        return;
      }
    }

    if (!deletePromptOpen && !key.ctrl && !key.meta && !key.shift && key.name === "d") {
      if (focus !== "canvas" && selectedWorkspaceId) {
        key.preventDefault();
        requestDeleteWorkspace();
        return;
      }
    }

    if (focus === "sidebar") {
      if (key.name === "up") {
        key.preventDefault();
        moveSidebarSelection(
          sidebarEntries,
          sidebarSelectionKey,
          -1,
          setSidebarSelectionKey,
          setSelectedWorkspaceId,
        );
        return;
      }

      if (key.name === "down") {
        key.preventDefault();
        moveSidebarSelection(
          sidebarEntries,
          sidebarSelectionKey,
          1,
          setSidebarSelectionKey,
          setSelectedWorkspaceId,
        );
        return;
      }

      if (key.name === "left") {
        key.preventDefault();
        if (selectedSidebarEntry?.kind === "repository") {
          if (!selectedSidebarEntry.isCollapsed) {
            collapseRepository(selectedSidebarEntry.repository.id);
          }
          return;
        }

        if (selectedSidebarEntry?.kind === "workspace") {
          collapseRepository(selectedSidebarEntry.repositoryId);
          focusRepository(selectedSidebarEntry.repositoryId);
        }
        return;
      }

      if (key.name === "right") {
        key.preventDefault();
        if (selectedSidebarEntry?.kind === "repository") {
          if (selectedSidebarEntry.isCollapsed) {
            expandRepository(selectedSidebarEntry.repository.id);
            return;
          }

          const firstWorkspace = selectedSidebarEntry.repository.workspaces[0];
          if (firstWorkspace) {
            focusWorkspace(firstWorkspace.id, "sidebar");
          }
        }
        return;
      }

      if (key.name === "return") {
        key.preventDefault();
        if (selectedSidebarEntry?.kind === "repository") {
          toggleRepository(selectedSidebarEntry.repository.id);
          return;
        }

        if (selectedSidebarEntry?.kind === "workspace") {
          focusWorkspace(selectedSidebarEntry.workspace.id, "canvas");
        }
      }
      return;
    }

    if (focus === "extensions") {
      if (key.name === "left" || (key.shift && key.name === "tab")) {
        key.preventDefault();
        cycleExtension(-1);
        return;
      }

      if (key.name === "right" || key.name === "tab") {
        key.preventDefault();
        cycleExtension(1);
        return;
      }
      return;
    }

    if (focus === "canvas" && ptyRef.current) {
      ptyRef.current.write(key.raw);
      key.preventDefault();
      key.stopPropagation();
    }
  });

  const emptySidebarMessage = loading
    ? "Loading local workspaces..."
    : workspaceListError
      ? workspaceListError
      : "No local workspaces yet.";
  const runtimeError = runtime?.launch_error ?? null;
  const workspacePath =
    terminalsEnvelope?.workspace.workspace_root ??
    selectedWorkspace?.workspacePath ??
    selectedWorkspace?.repositoryPath ??
    null;
  const deletePromptLabel = selectedWorkspace
    ? `${selectedWorkspace.repositorySlug}/${workspaceShortLabel(selectedWorkspace)}`
    : null;
  const headerTitle = selectedWorkspace
    ? `${selectedWorkspace.repositorySlug} > ${workspaceShortLabel(selectedWorkspace)}`
    : null;
  const headerActions =
    selectedWorkspace &&
    selectedWorkspace.host === "local" &&
    workspaceDetail?.stack.state === "ready"
      ? [
          {
            disabled: Boolean(stackActionBusy),
            key: "stack",
            label:
              stackActionBusy === "start"
                ? "Starting stack"
                : stackActionBusy === "stop"
                  ? "Stopping stack"
                  : hasActiveStackServices(workspaceDetail)
                    ? "Stop stack"
                    : "Start stack",
            onPress: () => {
              void toggleWorkspaceStack();
            },
          },
        ]
      : [];
  const terminalPlaceholder = shellError
    ? shellError
    : runtimeError
      ? runtimeError
      : sceneLoading
        ? "Resolving terminals..."
        : selectedWorkspace
          ? terminals.length === 0
            ? "No open tabs. Press Ctrl+T or click New shell."
            : "Waiting for terminal output..."
          : workspaceListError
            ? workspaceListError
            : loading
              ? "Loading local workspaces..."
              : workspaces.length > 0
                ? "Choose a workspace from the sidebar."
                : "No local workspaces yet. Link a repository in the desktop app or run `lifecycle repo init`.";

  return (
    <box
      style={{
        flexDirection: "row",
        flexGrow: 1,
      }}
    >
      <RepositorySidebar
        emptyMessage={emptySidebarMessage}
        focus={focus}
        onRepositoryPress={(repositoryId) => {
          focusRepository(repositoryId);
          toggleRepository(repositoryId);
        }}
        onWorkspacePress={(workspaceId) => {
          focusWorkspace(workspaceId, "canvas");
        }}
        selectedWorkspaceId={selectedWorkspaceId}
        sidebarEntries={sidebarEntries}
        sidebarSelectionKey={sidebarSelectionKey}
        sidebarWidth={sidebarWidth}
        theme={theme}
        title={TUI_TITLE}
      />

      <box style={{ flexDirection: "column", flexGrow: 1 }}>
        <WorkspaceHeader
          actions={headerActions}
          deleteBusy={deleteBusy}
          deleteError={deleteError}
          deletePromptLabel={deletePromptLabel}
          deletePromptOpen={deletePromptOpen}
          onCancelDelete={cancelDeleteWorkspace}
          onConfirmDelete={(force) => {
            void deleteWorkspace(force);
          }}
          theme={theme}
          title={headerTitle}
        />

        <box
          style={{
            flexDirection: "row",
            flexGrow: 1,
          }}
        >
          <box style={{ flexDirection: "column", flexGrow: 1 }}>
            <WorkspaceSessionStrip
              activeTerminalId={activeTerminalId}
              focus={focus}
              onCreateTerminal={() => {
                if (!selectedWorkspaceId || runtime?.supports_create === false) {
                  return;
                }
                void createTerminal(selectedWorkspaceId);
              }}
              onTerminalPress={(terminalId) => {
                scrollTerminalToBottomRef.current = true;
                setActiveTerminalId(terminalId);
                setFocus("canvas");
              }}
              terminals={terminals}
              theme={theme}
            />

            <WorkspaceShellPanel
              canvasCols={canvasCols}
              canvasRows={canvasRows}
              focus={focus}
              hasSelectedWorkspace={Boolean(selectedWorkspace) && !runtimeError}
              onCanvasMouseDown={() => {
                setFocus("canvas");
              }}
              onCanvasMouseScroll={() => {
                setFocus("canvas");
              }}
              shellError={shellError ?? runtimeError}
              terminalAnsi={terminalAnsi}
              terminalPlaceholder={terminalPlaceholder}
              terminalRenderRows={terminalRenderRows}
              terminalScrollRef={terminalScrollRef}
              theme={theme}
            />
          </box>

          <WorkspaceExtensionSidebar
            detail={workspaceDetail}
            focus={focus}
            onSelectExtension={(kind) => {
              setSelectedExtension(kind);
              setFocus("extensions");
            }}
            selectedExtension={selectedExtension}
            terminals={terminals}
            terminalsEnvelope={terminalsEnvelope}
            theme={theme}
            width={extensionWidth}
            workspacePath={workspacePath}
          />
        </box>
      </box>
    </box>
  );
}

function estimateTerminalRenderRows(ansi: string, viewportRows: number): number {
  const newlineCount = ansi === "" ? 0 : ansi.split("\n").length;
  return Math.max(viewportRows, Math.min(4_000, newlineCount + viewportRows));
}

async function runLaunchSpec(spec: WorkspaceShellLaunchSpec): Promise<number> {
  const processRef = Bun.spawn([resolveLaunchProgram(spec.program), ...spec.args], {
    env: mergeLaunchEnvironment(process.env, spec.env),
    stderr: "inherit",
    stdin: "ignore",
    stdout: "ignore",
    ...(spec.cwd !== null ? { cwd: spec.cwd } : {}),
  });
  return await processRef.exited;
}

function moveSidebarSelection(
  entries: SidebarEntry[],
  selectedSidebarEntryKey: string | null,
  delta: -1 | 1,
  setSidebarSelectionKey: (entryKey: string | null) => void,
  setSelectedWorkspaceId: (workspaceId: string | null) => void,
): void {
  if (entries.length === 0) {
    setSidebarSelectionKey(null);
    setSelectedWorkspaceId(null);
    return;
  }

  const currentIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.key === selectedSidebarEntryKey),
  );
  const nextIndex = (currentIndex + delta + entries.length) % entries.length;
  const nextEntry = entries[nextIndex] ?? null;
  setSidebarSelectionKey(nextEntry?.key ?? null);
  if (nextEntry?.kind === "workspace") {
    setSelectedWorkspaceId(nextEntry.workspace.id);
  }
}

function upsertTerminalRecord(
  terminals: WorkspaceTerminalRecord[],
  nextTerminal: WorkspaceTerminalRecord,
): WorkspaceTerminalRecord[] {
  const existingIndex = terminals.findIndex((terminal) => terminal.id === nextTerminal.id);
  if (existingIndex === -1) {
    return terminals.concat(nextTerminal);
  }

  return terminals.map((terminal, index) => (index === existingIndex ? nextTerminal : terminal));
}

function hasActiveStackServices(detail: WorkspaceDetailResponse): boolean {
  return detail.stack.nodes.some(
    (node) => node.kind !== "task" && (node.status === "ready" || node.status === "starting"),
  );
}

function resolveLaunchProgram(program: string): string {
  return Bun.which(program) ?? program;
}
