import { EmptyState } from "@lifecycle/ui";
import { Bot } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { AgentApprovalDecision, AgentImageMediaType, AgentInputPart } from "@lifecycle/agents";
import { diffTheme } from "@lifecycle/ui";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { readFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useSettings } from "@/features/settings/state/settings-context";
import {
  claudePermissionModeOptions,
  codexSandboxModeOptions,
  type ClaudePermissionMode,
  type CodexSandboxMode,
} from "@/features/settings/state/harness-settings";
import { DiffRenderProvider } from "@/features/git/components/diff-render-provider";
import { useAgentSession, useAgentSessionMessages } from "@/features/agents/hooks";
import { deriveAgentDisplayStatus, resolveAgentPromptDispatchDecision } from "@lifecycle/agents";
import {
  useAgentModelCatalog,
  useAgentClient,
  useAgentPromptQueueState,
  useAgentSessionState,
} from "@lifecycle/agents/react";
import {
  beginAgentPromptDispatch,
  completeAgentPromptDispatch,
  dismissAgentPrompt,
  failAgentPromptDispatch,
  queueAgentPrompt,
  retryAgentPrompt,
} from "@lifecycle/agents/session";
import { ClaudeIcon, CodexIcon } from "@/features/workspaces/surfaces/surface-icons";
import { useWorkspace } from "@/store/hooks";
import {
  type ParsedMessage,
  partRecordToPart,
  createTurnId,
  ensureSelectedOption,
  buildReasoningOptions,
} from "@/features/agents/components/agent-message-parsing";
import { TranscriptMessage } from "@/features/agents/components/agent-transcript";
import { AgentActivityBar } from "@/features/agents/components/agent-activity-bar";
import type { AgentMessageWithParts } from "@lifecycle/contracts";
import { useWorkspaceOpenRequests } from "@/features/workspaces/state/workspace-open-requests";
import { createFileEditorOpenInput } from "@/features/workspaces/canvas/workspace-canvas-requests";
import { useWorkspacePaneRenderCount } from "@/features/workspaces/canvas/workspace-pane-performance";
import { useCommandPaletteExplorer } from "@/features/command-palette/use-command-palette-explorer";
import { AgentComposer } from "./agent-composer";
import { type AgentPromptInputHandle } from "./agent-prompt-input";
import { useAgentCommands } from "./use-agent-commands";

// ---------------------------------------------------------------------------
// Image file extensions → media types for Tauri native drag-drop (no MIME available)
// ---------------------------------------------------------------------------
const IMAGE_EXT_TO_MEDIA_TYPE: Record<string, AgentImageMediaType> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

// ---------------------------------------------------------------------------
// Turn activity display
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

interface AgentSurfaceProps {
  agentSessionId: string;
  paneFocused?: boolean;
  workspaceId: string;
}

interface TranscriptItemContext {
  messages: ParsedMessage[];
  isRunning: boolean;
  onResolveApproval: (
    approvalId: string,
    decision: AgentApprovalDecision,
    response?: Record<string, unknown> | null,
  ) => Promise<void>;
  onOpenFile: (filePath: string) => void;
  resolvingApprovalIds: ReadonlySet<string>;
}

function TranscriptItemContent(index: number, _data: unknown, context: TranscriptItemContext) {
  const message = context.messages[index];
  if (!message) return null;
  return (
    <TranscriptMessage
      key={message.id}
      message={message}
      isStreaming={
        context.isRunning && index === context.messages.length - 1 && message.role === "assistant"
      }
      onResolveApproval={context.onResolveApproval}
      onOpenFile={context.onOpenFile}
      resolvingApprovalIds={context.resolvingApprovalIds}
    />
  );
}

function buildParsedMessages(records: AgentMessageWithParts[] | undefined): ParsedMessage[] {
  const raw = (records ?? []).map((record) => ({
    id: record.id,
    role: record.role,
    text: record.text,
    turnId: record.turn_id,
    parts:
      record.parts.length > 0
        ? record.parts.map((part) => ({
            id: part.id,
            part: partRecordToPart(part),
          }))
        : record.text.length > 0
          ? [{ id: `${record.id}:text`, part: { type: "text" as const, text: record.text } }]
          : [],
  }));

  const merged: ParsedMessage[] = [];
  for (const message of raw) {
    const previous = merged.length > 0 ? merged[merged.length - 1] : null;
    if (
      previous &&
      message.role === "assistant" &&
      previous.role === "assistant" &&
      message.turnId !== null &&
      message.turnId === previous.turnId
    ) {
      previous.parts.push(...message.parts);
      continue;
    }
    merged.push(message);
  }

  return merged;
}

export const AgentSurface = memo(function AgentSurface({
  agentSessionId,
  paneFocused,
  workspaceId,
}: AgentSurfaceProps) {
  useWorkspacePaneRenderCount("AgentSurface", agentSessionId);
  const agentClient = useAgentClient();
  const workspace = useWorkspace(workspaceId);
  const session = useAgentSession(workspaceId, agentSessionId);
  const dbMessages = useAgentSessionMessages(agentSessionId);
  const state = useAgentSessionState(agentSessionId);
  const promptQueue = useAgentPromptQueueState(agentSessionId);
  const { harnesses, resolvedTheme, setClaudeHarnessSettings, setCodexHarnessSettings } =
    useSettings();
  const sessionProvider = session?.provider ?? "claude";
  const providerForCatalog = sessionProvider === "codex" ? "codex" : "claude";
  const [catalogEnabled, setCatalogEnabled] = useState(false);
  const modelCatalog = useAgentModelCatalog(providerForCatalog, {
    enabled: catalogEnabled,
    loginMethod: harnesses.claude.loginMethod,
    preferredModel:
      providerForCatalog === "claude" ? harnesses.claude.model : harnesses.codex.model,
  });
  const { openTab } = useWorkspaceOpenRequests();
  const draftKey = `agent-draft:${agentSessionId}`;
  const [draftPrompt, setDraftPromptRaw] = useState(() => sessionStorage.getItem(draftKey) ?? "");

  function setDraftPrompt(value: string | ((prev: string) => string)): void {
    setDraftPromptRaw((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      if (next) {
        sessionStorage.setItem(draftKey, next);
      } else {
        sessionStorage.removeItem(draftKey);
      }
      return next;
    });
  }
  const [resolvingApprovalIds, setResolvingApprovalIds] = useState<Set<string>>(new Set());
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<
    Array<{ mediaType: AgentImageMediaType; base64Data: string }>
  >([]);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const hasScrolledToBottomRef = useRef(false);
  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "smooth" });
  }, []);
  const promptComposerRef = useRef<AgentPromptInputHandle>(null);

  const isClaude = sessionProvider === "claude";
  const planMode = isClaude
    ? harnesses.claude.permissionMode === "plan"
    : harnesses.codex.sandboxMode === "read-only";
  const prePlanPermissionsRef = useRef<string | null>(null);

  const isRunning = promptQueue.dispatchingPromptId !== null || state.pendingTurnIds.length > 0;
  const theme = diffTheme(resolvedTheme);

  // Trigger menu data sources
  const explorer = useCommandPaletteExplorer();
  const agentCommands = useAgentCommands({
    onTogglePlanMode: () => {
      // Simulate Shift+Tab toggle
      if (!planMode) {
        if (isClaude) {
          prePlanPermissionsRef.current = harnesses.claude.permissionMode;
          setClaudeHarnessSettings({ ...harnesses.claude, permissionMode: "plan" });
        } else {
          prePlanPermissionsRef.current = harnesses.codex.sandboxMode;
          setCodexHarnessSettings({ ...harnesses.codex, sandboxMode: "read-only" });
        }
      } else {
        const prev = prePlanPermissionsRef.current;
        if (isClaude) {
          setClaudeHarnessSettings({
            ...harnesses.claude,
            permissionMode: (prev as ClaudePermissionMode) ?? "auto-approve",
          });
        } else {
          setCodexHarnessSettings({
            ...harnesses.codex,
            sandboxMode: (prev as CodexSandboxMode) ?? "full-auto",
          });
        }
        prePlanPermissionsRef.current = null;
      }
    },
  });

  // Escape key to interrupt current turn (only in focused pane)
  useEffect(() => {
    if (!isRunning || !paneFocused) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        const activeTurnId = state.pendingTurnIds[0] ?? null;
        if (!session?.id) return;
        void agentClient
          .cancelTurn(session.id, { turnId: activeTurnId })
          .catch((err) => console.error("[agent] cancel turn failed:", err));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isRunning, paneFocused, state.pendingTurnIds, agentClient, session?.id]);

  // Shift+Tab to toggle plan mode — store/restore the current permissions value
  useEffect(() => {
    if (!paneFocused) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Tab" && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (!planMode) {
          // Save current permissions value and switch to plan/read-only
          if (isClaude) {
            prePlanPermissionsRef.current = harnesses.claude.permissionMode;
            setClaudeHarnessSettings({ ...harnesses.claude, permissionMode: "plan" });
          } else {
            prePlanPermissionsRef.current = harnesses.codex.sandboxMode;
            setCodexHarnessSettings({ ...harnesses.codex, sandboxMode: "read-only" });
          }
        } else {
          // Restore previous permissions value
          const prev = prePlanPermissionsRef.current;
          if (isClaude) {
            setClaudeHarnessSettings({
              ...harnesses.claude,
              permissionMode: (prev as ClaudePermissionMode) ?? "acceptEdits",
            });
          } else {
            setCodexHarnessSettings({
              ...harnesses.codex,
              sandboxMode: (prev as CodexSandboxMode) ?? "workspace-write",
            });
          }
          prePlanPermissionsRef.current = null;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    paneFocused,
    planMode,
    isClaude,
    harnesses,
    setClaudeHarnessSettings,
    setCodexHarnessSettings,
  ]);

  // Focus input when pane gains focus or this tab becomes active
  useEffect(() => {
    if (paneFocused) {
      promptComposerRef.current?.focus();
    }
  }, [paneFocused, agentSessionId]);

  useEffect(() => {
    let frameId = 0;
    frameId = window.requestAnimationFrame(() => {
      setCatalogEnabled(true);
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  // Live query returns messages ordered by created_at via IVM.
  // Merge consecutive assistant messages that share a turn_id so tools + text
  // render as one visual block (the SDK often splits them into separate rows).
  //
  // Queued prompts are appended as optimistic user messages so the user's text
  // appears instantly — before the round-trip through worker → DB → collection.
  const messages = useMemo(() => {
    const persisted = buildParsedMessages(dbMessages.data);

    const optimistic: ParsedMessage[] = [];
    for (const queued of promptQueue.prompts) {
      // Skip the prompt currently being dispatched — it will appear (or already
      // has appeared) in the persisted messages from the DB, so including it
      // here would cause a duplicate.
      if (queued.id === promptQueue.dispatchingPromptId) continue;
      const text = queued.input
        .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
        .map((p) => p.text)
        .join("\n");
      if (text.length === 0) continue;
      optimistic.push({
        id: `optimistic:${queued.id}`,
        role: "user",
        turnId: null,
        text,
        parts: [{ id: `optimistic:${queued.id}:text`, part: { type: "text", text } }],
      });
    }

    return optimistic.length > 0 ? [...persisted, ...optimistic] : persisted;
  }, [dbMessages.data, promptQueue.dispatchingPromptId, promptQueue.prompts]);

  // Scroll to bottom once when messages first load (e.g. after HMR or reattach).
  // Use rAF to ensure Virtuoso has actually rendered before scrolling.
  useEffect(() => {
    if (messages.length > 0 && !hasScrolledToBottomRef.current) {
      hasScrolledToBottomRef.current = true;
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "auto" });
      });
    }
  }, [messages.length]);

  const handleOpenFile = useCallback(
    (filePath: string): void => {
      // Agent tools report absolute paths — strip the worktree root so the
      // backend receives a repo-relative path.
      const root = workspace?.worktree_path;
      if (!root || !filePath.startsWith(root)) {
        // File is outside the workspace worktree — cannot open in the file editor.
        return;
      }
      const repoRelative = filePath.slice(root.length).replace(/^\//, "");
      openTab(workspaceId, createFileEditorOpenInput(repoRelative));
    },
    [workspace?.worktree_path, workspaceId, openTab],
  );

  const addImagesFromFiles = useCallback((files: FileList | File[]): void => {
    const validTypes = new Set<AgentImageMediaType>([
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
    ]);
    for (const file of files) {
      if (!validTypes.has(file.type as AgentImageMediaType)) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64Data = dataUrl.split(",")[1];
        if (base64Data) {
          setPendingImages((prev) => [
            ...prev,
            { mediaType: file.type as AgentImageMediaType, base64Data },
          ]);
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const addImagesFromPaths = useCallback(async (paths: string[]) => {
    for (const filePath of paths) {
      const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
      const mediaType = IMAGE_EXT_TO_MEDIA_TYPE[ext];
      if (!mediaType) continue;
      try {
        const bytes = await readFile(filePath);
        const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
        const base64Data = btoa(binary);
        setPendingImages((prev) => [...prev, { mediaType, base64Data }]);
      } catch {
        // skip unreadable files
      }
    }
  }, []);

  // Tauri native drag-drop: the webview intercepts file drops and provides
  // file system paths instead of HTML5 drag events.
  const [isDragOver, setIsDragOver] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      if (cancelled) return;
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setIsDragOver(true);
        } else if (event.payload.type === "drop") {
          setIsDragOver(false);
          addImagesFromPaths(event.payload.paths);
        } else {
          setIsDragOver(false);
        }
      });
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [addImagesFromPaths]);

  const activeTurnId = state.pendingTurnIds[0] ?? null;

  useEffect(() => {
    const head = promptQueue.prompts[0];
    if (!session || !head || promptQueue.dispatchingPromptId !== null || head.error) {
      return;
    }
    const activeSession = session;

    const decision = resolveAgentPromptDispatchDecision({
      activeTurnId,
      hasPendingApprovals: state.pendingApprovals.length > 0,
      provider: activeSession.provider,
    });
    if (decision.type !== "dispatch_turn") {
      return;
    }

    const claimedPrompt = beginAgentPromptDispatch(agentSessionId, head.id);
    if (!claimedPrompt) {
      return;
    }
    const queuedPrompt = claimedPrompt;

    async function dispatchQueuedPrompt(): Promise<void> {
      setSendError(null);

      try {
        await agentClient.sendTurn(activeSession.id, {
          turnId: createTurnId(),
          input: queuedPrompt.input,
        });
        completeAgentPromptDispatch(agentSessionId, queuedPrompt.id);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Failed to send prompt.";
        console.error("[agent] dispatch queued prompt failed:", error);
        setSendError(message);
        failAgentPromptDispatch(agentSessionId, queuedPrompt.id, message);
      }
    }

    void dispatchQueuedPrompt();
  }, [
    agentSessionId,
    activeTurnId,
    agentClient,
    promptQueue.dispatchingPromptId,
    promptQueue.prompts,
    session,
    state.pendingApprovals.length,
  ]);

  const queueMessage = useCallback((): void => {
    const prompt = draftPrompt.trim();
    if (prompt.length === 0 && pendingImages.length === 0) return;
    if (!session) return;
    const input: AgentInputPart[] = [];
    if (prompt.length > 0) {
      input.push({ type: "text", text: prompt });
    }
    for (const img of pendingImages) {
      input.push({ type: "image", mediaType: img.mediaType, base64Data: img.base64Data });
    }

    setSendError(null);
    setDraftPrompt("");
    setPendingImages([]);
    scrollToBottom();

    // If the session is idle, send directly — skip the queue entirely.
    const decision = resolveAgentPromptDispatchDecision({
      activeTurnId,
      hasPendingApprovals: state.pendingApprovals.length > 0,
      provider: session.provider,
    });
    if (
      decision.type === "dispatch_turn" &&
      promptQueue.dispatchingPromptId === null &&
      promptQueue.prompts.length === 0
    ) {
      void (async () => {
        try {
          await agentClient.sendTurn(session.id, {
            turnId: createTurnId(),
            input,
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : typeof error === "string"
                ? error
                : "Failed to send prompt.";
          console.error("[agent] direct send failed:", error);
          setSendError(message);
        }
      })();
      return;
    }

    // Otherwise, queue for later dispatch.
    queueAgentPrompt(agentSessionId, input);
  }, [
    agentSessionId,
    activeTurnId,
    agentClient,
    draftPrompt,
    pendingImages,
    promptQueue.dispatchingPromptId,
    promptQueue.prompts.length,
    scrollToBottom,
    session,
    state.pendingApprovals.length,
  ]);

  const handleRetryQueuedPrompt = useCallback(
    (promptId: string): void => {
      retryAgentPrompt(agentSessionId, promptId);
      setSendError(null);
    },
    [agentSessionId],
  );

  const handleDismissQueuedPrompt = useCallback(
    (promptId: string): void => {
      dismissAgentPrompt(agentSessionId, promptId);
      setSendError(null);
    },
    [agentSessionId],
  );

  const sessionId = session?.id ?? null;
  const handleResolveApproval = useCallback(
    async (
      approvalId: string,
      decision: AgentApprovalDecision,
      response?: Record<string, unknown> | null,
    ): Promise<void> => {
      if (!sessionId) {
        return;
      }

      setResolvingApprovalIds((prev) => {
        const next = new Set(prev);
        next.add(approvalId);
        return next;
      });
      setSendError(null);

      try {
        await agentClient.resolveApproval(sessionId, {
          approvalId,
          decision,
          response: response ?? null,
        });
      } catch (error) {
        setSendError(error instanceof Error ? error.message : "Failed to resolve approval.");
      } finally {
        setResolvingApprovalIds((prev) => {
          const next = new Set(prev);
          next.delete(approvalId);
          return next;
        });
      }
    },
    [sessionId, agentClient],
  );

  const onDraftPromptChange = useCallback((value: string) => setDraftPrompt(value), []);
  const onRemovePendingImage = useCallback(
    (i: number) => setPendingImages((prev) => prev.filter((_, j) => j !== i)),
    [],
  );

  const displayStatus = useMemo(() => deriveAgentDisplayStatus(state), [state]);

  const transcriptContext = useMemo<TranscriptItemContext>(
    () => ({
      messages,
      isRunning,
      onResolveApproval: handleResolveApproval,
      onOpenFile: handleOpenFile,
      resolvingApprovalIds,
    }),
    [messages, isRunning, handleResolveApproval, handleOpenFile, resolvingApprovalIds],
  );

  const visibleError = sendError ?? state.lastError;
  const showThinking = state.pendingTurnIds.length > 0 && state.pendingApprovals.length === 0;
  const queuedMessageCount = Math.max(
    0,
    promptQueue.prompts.length - (promptQueue.dispatchingPromptId !== null ? 1 : 0),
  );
  const showCenteredComposer =
    (session?.status === "idle" || session?.status === "starting") &&
    messages.length === 0 &&
    promptQueue.prompts.length === 0 &&
    state.pendingTurnIds.length === 0 &&
    state.pendingApprovals.length === 0 &&
    visibleError === null &&
    state.authStatus?.mode !== "authenticating" &&
    state.authStatus?.mode !== "error";

  // --- Provider adapter: single place that maps provider-specific settings
  // into a uniform shape consumed by the status bar. Adding a new provider
  // means adding one more branch here — nothing else in the component changes.
  const provider = (() => {
    const catalogModels = (modelCatalog.catalog?.models ?? []).map((o) => ({
      id: o.value,
      label: o.label,
    }));

    if (isClaude) {
      const s = harnesses.claude;
      const catalogModel = modelCatalog.catalog?.models.find((m) => m.value === s.model) ?? null;
      return {
        name: "claude" as const,
        Icon: ClaudeIcon,
        permissions: {
          options: claudePermissionModeOptions.map((o) => ({
            id: o.value,
            label: o.label,
            description: o.description,
          })),
          selected: s.permissionMode,
          onChange(value: string) {
            setClaudeHarnessSettings({
              ...s,
              permissionMode: value as ClaudePermissionMode,
              dangerousSkipPermissions: value === "bypassPermissions",
            });
          },
        },
        model: {
          options: ensureSelectedOption(catalogModels, s.model),
          selected: s.model,
          onChange(value: string) {
            const next = modelCatalog.catalog?.models.find((m) => m.value === value) ?? null;
            const supported = new Set(next?.reasoningEfforts ?? []);
            setClaudeHarnessSettings({
              ...s,
              model: value,
              effort: s.effort === "default" || supported.has(s.effort) ? s.effort : "default",
            });
          },
        },
        reasoning: {
          options: buildReasoningOptions(
            sessionProvider,
            catalogModel?.reasoningEfforts ?? [],
            s.effort,
          ),
          selected: s.effort,
          onChange(value: string) {
            setClaudeHarnessSettings({ ...s, effort: value as typeof s.effort });
          },
        },
      };
    }

    // Codex
    const s = harnesses.codex;
    const catalogModel = modelCatalog.catalog?.models.find((m) => m.value === s.model) ?? null;
    return {
      name: "codex" as const,
      Icon: CodexIcon,
      permissions: {
        options: codexSandboxModeOptions.map((o) => ({
          id: o.value,
          label: o.label,
          description: o.description,
        })),
        selected: s.sandboxMode,
        onChange(value: string) {
          setCodexHarnessSettings({ ...s, sandboxMode: value as CodexSandboxMode });
        },
      },
      model: {
        options: ensureSelectedOption(catalogModels, s.model),
        selected: s.model,
        onChange(value: string) {
          const next = modelCatalog.catalog?.models.find((m) => m.value === value) ?? null;
          const supported = new Set(next?.reasoningEfforts ?? []);
          setCodexHarnessSettings({
            ...s,
            model: value,
            reasoningEffort:
              s.reasoningEffort === "default" || supported.has(s.reasoningEffort)
                ? s.reasoningEffort
                : "default",
          });
        },
      },
      reasoning: {
        options: buildReasoningOptions(
          sessionProvider,
          catalogModel?.reasoningEfforts ?? [],
          s.reasoningEffort,
        ),
        selected: s.reasoningEffort,
        onChange(value: string) {
          setCodexHarnessSettings({ ...s, reasoningEffort: value as typeof s.reasoningEffort });
        },
      },
    };
  })();
  const composerQueuedPrompts = useMemo(
    () =>
      promptQueue.prompts.map((entry) => ({
        attachmentSummary: entry.preview.attachmentSummary,
        error: entry.error,
        id: entry.id,
        text: entry.preview.text,
      })),
    [promptQueue.prompts],
  );
  const composerPromptProps = useMemo(
    () => ({
      agentSessionId,
      commandItems: agentCommands,
      draftPrompt,
      error: visibleError ?? null,
      fileItems: explorer.items,
      isRunning,
      onAddImagesFromFiles: addImagesFromFiles,
      onDismissQueuedPrompt: handleDismissQueuedPrompt,
      onDraftPromptChange,
      onRemovePendingImage,
      onRetryQueuedPrompt: handleRetryQueuedPrompt,
      onSend: queueMessage,
      pendingImages,
      planMode,
      queuedPrompts: composerQueuedPrompts,
    }),
    [
      agentSessionId,
      agentCommands,
      draftPrompt,
      visibleError,
      explorer.items,
      isRunning,
      addImagesFromFiles,
      handleDismissQueuedPrompt,
      onDraftPromptChange,
      onRemovePendingImage,
      handleRetryQueuedPrompt,
      queueMessage,
      pendingImages,
      planMode,
      composerQueuedPrompts,
    ],
  );
  const debugRef = useRef({ messages: dbMessages.data ?? [], session, sessionState: state });
  debugRef.current = { messages: dbMessages.data ?? [], session, sessionState: state };
  const composerToolbarProps = useMemo(
    () => ({
      catalogError: modelCatalog.error,
      catalogLoading: modelCatalog.isLoading,
      debugRef,
      displayStatus,
      model: provider.model,
      permissions: provider.permissions,
      providerName: provider.name,
      ProviderIcon: provider.Icon,
      reasoning: provider.reasoning,
      responseReady: state.responseReady,
      usage: state.usage,
    }),
    [
      modelCatalog.error,
      modelCatalog.isLoading,
      displayStatus,
      provider,
      state.responseReady,
      state.usage,
    ],
  );

  if (!session) {
    return (
      <EmptyState
        description="Lifecycle could not find this agent session."
        icon={<Bot />}
        title="Agent unavailable"
      />
    );
  }

  if (dbMessages.error) {
    return (
      <DiffRenderProvider theme={theme}>
        <EmptyState
          description={dbMessages.error.message}
          icon={<Bot />}
          title="Agent transcript unavailable"
        />
      </DiffRenderProvider>
    );
  }

  return (
    <DiffRenderProvider theme={theme}>
      <section
        className="agent-surface relative flex h-full min-h-0 flex-col bg-[var(--terminal-surface,var(--surface))]"
        onClick={(e) => {
          // Focus textarea when clicking unhandled areas of the surface
          if (e.target === e.currentTarget) {
            promptComposerRef.current?.focus();
          }
        }}
      >
        {showCenteredComposer ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
            <div className="w-full max-w-3xl">
              <AgentComposer
                ref={promptComposerRef}
                layout="centered"
                prompt={composerPromptProps}
                toolbar={composerToolbarProps}
                toolbarClassName="mt-2"
              />
            </div>
          </div>
        ) : (
          <>
            {/* Virtualized transcript */}
            <Virtuoso
              ref={virtuosoRef}
              className="agent-message-list relative min-h-0 flex-1"
              context={transcriptContext}
              computeItemKey={(index) => messages[index]?.id ?? index}
              totalCount={messages.length}
              itemContent={TranscriptItemContent}
              initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
              followOutput="smooth"
              increaseViewportBy={{ top: 400, bottom: 200 }}
              alignToBottom
              atBottomThreshold={40}
              components={{
                Header: () => (
                  <div className="pt-4">
                    {session.status === "starting" ? (
                      <div className="px-4 py-3 text-[13px] leading-6 text-[var(--muted-foreground)]">
                        <span className="text-[var(--accent)]">[~]</span> starting {provider.name}
                        ...
                      </div>
                    ) : null}
                    {state.authStatus?.mode === "authenticating" ? (
                      <div className="px-4 py-3 text-[13px] leading-6 text-[var(--muted-foreground)]">
                        <span className="text-[var(--accent)]">[~]</span> signing in to{" "}
                        {provider.name}...
                      </div>
                    ) : null}
                    {state.authStatus?.mode === "error" ? (
                      <div className="px-4 py-3 text-[13px] leading-6 text-[var(--destructive)]">
                        <span>[!]</span> authentication failed
                      </div>
                    ) : null}
                    {session.status === "failed" &&
                    state.authStatus?.mode !== "error" &&
                    !visibleError ? (
                      <div className="px-4 py-3 text-[13px] leading-6 text-[var(--destructive)]">
                        <span>[!]</span> failed to start {provider.name}
                      </div>
                    ) : null}
                  </div>
                ),
                Footer: () => (
                  <AgentActivityBar
                    turnActivity={state.turnActivity}
                    queuedMessageCount={queuedMessageCount}
                    visible={showThinking}
                  />
                ),
              }}
            />

            <AgentComposer
              ref={promptComposerRef}
              layout="docked"
              prompt={composerPromptProps}
              toolbar={composerToolbarProps}
            />
          </>
        )}

        {/* Drop overlay */}
        {isDragOver ? (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-[var(--surface)]/80 backdrop-blur-sm">
            <div className="rounded-lg border-2 border-dashed border-[var(--accent)] px-6 py-4 text-[13px] text-[var(--accent)]">
              Drop images to attach
            </div>
          </div>
        ) : null}

        <style>{`
        @keyframes agent-cursor-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
        .agent-cursor-blink {
          animation: agent-cursor-pulse 1.2s ease-in-out infinite;
        }
      `}</style>
      </section>
    </DiffRenderProvider>
  );
});
