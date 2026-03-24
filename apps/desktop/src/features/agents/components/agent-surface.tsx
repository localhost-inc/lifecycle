import { EmptyState, Shimmer } from "@lifecycle/ui";
import { Bot } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type {
  AgentApprovalDecision,
  AgentImageMediaType,
  AgentInputPart,
  AgentTurnActivity,
} from "@lifecycle/agents";
import { diffTheme } from "@lifecycle/ui";
import { useSettings } from "@/features/settings/state/settings-provider";
import type { ClaudePermissionMode } from "@/features/settings/state/harnesses/claude";
import { claudePermissionModeOptions } from "@/features/settings/state/harnesses/claude";
import type { CodexSandboxMode } from "@/features/settings/state/harnesses/codex";
import { codexSandboxModeOptions } from "@/features/settings/state/harnesses/codex";
import { DiffRenderProvider } from "@/features/git/components/diff-render-provider";
import { useAgentSession, useAgentSessionMessages } from "@/features/agents/hooks";
import { useProviderModelCatalog } from "@/features/agents/state/use-provider-model-catalog";
import { useAgentSessionState } from "@/features/agents/state/agent-session-state";
import { ClaudeIcon, CodexIcon } from "@/features/workspaces/surfaces/surface-icons";
import { useAgentOrchestrator } from "@/store/provider";
import { useWorkspace } from "@/store/hooks";
import {
  type ParsedMessage,
  partRecordToPart,
  createTurnId,
  ensureSelectedOption,
  buildReasoningOptions,
} from "@/features/agents/components/agent-message-parsing";
import { TranscriptMessage } from "@/features/agents/components/agent-transcript";
import { AgentStatusBar } from "@/features/agents/components/agent-status-bar";
import type { AgentMessageWithParts } from "@lifecycle/contracts";
import { useWorkspaceOpenRequests } from "@/features/workspaces/state/workspace-open-requests";
import { createFileViewerOpenInput } from "@/features/workspaces/canvas/workspace-canvas-requests";

// ---------------------------------------------------------------------------
// Turn activity display
// ---------------------------------------------------------------------------

function formatTurnActivity(activity: AgentTurnActivity | null): string {
  if (!activity) {
    return "Working";
  }

  switch (activity.phase) {
    case "thinking":
      return "Thinking";
    case "responding":
      return "Writing";
    case "tool_use":
      if (activity.toolName) {
        return activity.toolName;
      }
      return "Running tools";
  }
}

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

interface AgentSurfaceProps {
  agentSessionId: string;
  paneFocused?: boolean;
  workspaceId: string;
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

export function AgentSurface({ agentSessionId, paneFocused, workspaceId }: AgentSurfaceProps) {
  const agentOrchestrator = useAgentOrchestrator();
  const workspace = useWorkspace(workspaceId);
  const session = useAgentSession(workspaceId, agentSessionId);
  const dbMessages = useAgentSessionMessages(agentSessionId);
  const state = useAgentSessionState(agentSessionId);
  const { harnesses, resolvedTheme, setClaudeHarnessSettings, setCodexHarnessSettings } =
    useSettings();
  const providerForCatalog = session?.provider === "codex" ? "codex" : "claude";
  const [catalogEnabled, setCatalogEnabled] = useState(false);
  const modelCatalog = useProviderModelCatalog(providerForCatalog, {
    enabled: catalogEnabled,
    loginMethod: harnesses.claude.loginMethod,
    preferredModel:
      providerForCatalog === "claude" ? harnesses.claude.model : harnesses.codex.model,
  });
  const { openDocument } = useWorkspaceOpenRequests();
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
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<
    Array<{ mediaType: AgentImageMediaType; base64Data: string }>
  >([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isClaude = session?.provider === "claude";
  const planMode = isClaude
    ? harnesses.claude.permissionMode === "plan"
    : harnesses.codex.sandboxMode === "read-only";
  const prePlanPermissionsRef = useRef<string | null>(null);

  const isRunning = isSending || state.pendingTurnIds.length > 0;
  const [inputFocused, setInputFocused] = useState(false);
  const showCursorBlink = inputFocused && !isRunning && draftPrompt.length === 0;
  const theme = diffTheme(resolvedTheme);

  // Track elapsed time while the agent is working
  const thinkingStartRef = useRef<number | null>(null);
  const [thinkingElapsed, setThinkingElapsed] = useState(0);

  useEffect(() => {
    if (isRunning && paneFocused) {
      if (thinkingStartRef.current === null) {
        thinkingStartRef.current = Date.now();
      }
      setThinkingElapsed(0);
      const interval = setInterval(() => {
        setThinkingElapsed(
          Math.round((Date.now() - (thinkingStartRef.current ?? Date.now())) / 1000),
        );
      }, 1000);
      return () => clearInterval(interval);
    }
    if (!isRunning) {
      thinkingStartRef.current = null;
      setThinkingElapsed(0);
    }
  }, [isRunning, paneFocused]);

  // Escape key to interrupt current turn (only in focused pane)
  useEffect(() => {
    if (!isRunning || !paneFocused) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        const activeTurnId = state.pendingTurnIds[0] ?? null;
        if (!session?.id) return;
        void agentOrchestrator
          .cancelTurn(session.id, { turnId: activeTurnId })
          .catch((err) => console.error("[agent] cancel turn failed:", err));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isRunning, paneFocused, state.pendingTurnIds, agentOrchestrator, session?.id]);

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
      textareaRef.current?.focus();
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
  const messages = useMemo(() => buildParsedMessages(dbMessages.data), [dbMessages.data]);

  // Scroll to bottom only on initial mount
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (hasScrolledRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    hasScrolledRef.current = true;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  function handleOpenFile(filePath: string): void {
    // Agent tools report absolute paths — strip the worktree root so the
    // backend receives a repo-relative path.
    let repoRelative = filePath;
    const root = workspace?.worktree_path;
    if (root && filePath.startsWith(root)) {
      repoRelative = filePath.slice(root.length).replace(/^\//, "");
    }
    openDocument(workspaceId, createFileViewerOpenInput(repoRelative));
  }

  function addImagesFromFiles(files: FileList | File[]): void {
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
  }

  async function handleSend(): Promise<void> {
    if (!session) return;
    const prompt = draftPrompt.trim();
    if (prompt.length === 0 && pendingImages.length === 0) return;
    if (isSending) return;

    setIsSending(true);
    setSendError(null);

    try {
      const input: AgentInputPart[] = [];
      if (prompt.length > 0) {
        input.push({ type: "text", text: prompt });
      }
      for (const img of pendingImages) {
        input.push({ type: "image", mediaType: img.mediaType, base64Data: img.base64Data });
      }
      await agentOrchestrator.sendTurn(session.id, {
        turnId: createTurnId(),
        input,
      });
      setDraftPrompt("");
      setPendingImages([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      // Scroll transcript to the bottom after sending
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to send prompt.");
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  }

  async function handleResolveApproval(
    approvalId: string,
    decision: AgentApprovalDecision,
    response?: Record<string, unknown> | null,
  ): Promise<void> {
    if (!session) {
      return;
    }

    setResolvingApprovalIds((prev) => {
      const next = new Set(prev);
      next.add(approvalId);
      return next;
    });
    setSendError(null);

    try {
      await agentOrchestrator.resolveApproval(session.id, {
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
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  function handleTextareaChange(event: React.ChangeEvent<HTMLTextAreaElement>): void {
    setDraftPrompt(event.target.value);
    const el = event.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

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

  const visibleError = sendError ?? state.lastError;
  const showThinking = isRunning && state.pendingApprovals.length === 0;

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
            session.provider,
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
          session.provider,
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

  return (
    <DiffRenderProvider theme={theme}>
      <section
        className="agent-surface flex h-full min-h-0 flex-col bg-[var(--terminal-surface,var(--surface))]"
        onClick={(e) => {
          // Focus textarea when clicking unhandled areas of the surface
          if (e.target === e.currentTarget) {
            textareaRef.current?.focus();
          }
        }}
      >
        {/* Transcript + input */}
        <div
          ref={scrollRef}
          className="agent-message-list flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
          onClick={() => textareaRef.current?.focus()}
        >
          <div className="flex-1" />

          {/* Auth status */}
          {session.status === "starting" ? (
            <div className="px-4 py-3 text-[13px] leading-6 text-[var(--muted-foreground)]">
              <span className="text-[var(--accent)]">[~]</span> starting {provider.name}...
            </div>
          ) : null}
          {state.authStatus?.mode === "authenticating" ? (
            <div className="px-4 py-3 text-[13px] leading-6 text-[var(--muted-foreground)]">
              <span className="text-[var(--accent)]">[~]</span> signing in to {provider.name}...
            </div>
          ) : null}
          {state.authStatus?.mode === "error" ? (
            <div className="px-4 py-3 text-[13px] leading-6 text-[var(--destructive)]">
              <span>[!]</span> authentication failed
            </div>
          ) : null}
          {session.status === "failed" && state.authStatus?.mode !== "error" && !visibleError ? (
            <div className="px-4 py-3 text-[13px] leading-6 text-[var(--destructive)]">
              <span>[!]</span> failed to start {provider.name}
            </div>
          ) : null}

          {/* Messages — single source from DB collection */}
          {messages.map((message, i) => (
            <TranscriptMessage
              key={message.id}
              message={message}
              isStreaming={isRunning && i === messages.length - 1 && message.role === "assistant"}
              onResolveApproval={handleResolveApproval}
              onOpenFile={handleOpenFile}
              resolvingApprovalIds={resolvingApprovalIds}
            />
          ))}

          {/* Working indicator */}
          {showThinking ? (
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 text-[13px]">
                <span className="agent-cursor-blink text-[var(--muted-foreground)]">&#8226;</span>
                <Shimmer as="span" duration={2} spread={2} className="text-[13px]">
                  {formatTurnActivity(state.turnActivity)}
                </Shimmer>
                <span className="text-[var(--muted-foreground)]/50">
                  ({thinkingElapsed}s · esc to interrupt)
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Input */}
        <div
          className="shrink-0 bg-[var(--surface-hover)]/50"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.files.length > 0) {
              addImagesFromFiles(e.dataTransfer.files);
            }
          }}
        >
          {pendingImages.length > 0 ? (
            <div className="flex flex-wrap gap-2 px-4 pt-2">
              {pendingImages.map((img, i) => (
                <div key={i} className="group relative">
                  <img
                    src={`data:${img.mediaType};base64,${img.base64Data}`}
                    alt={`Attached image ${i + 1}`}
                    className="h-16 w-16 rounded border border-[var(--border)] object-cover"
                  />
                  <button
                    className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-[var(--destructive)] text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => setPendingImages((prev) => prev.filter((_, j) => j !== i))}
                    type="button"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex items-start px-4 pt-3 pb-2">
            <span className="shrink-0 pt-[3px] text-[13px] text-[var(--accent)]">
              &#9654;&nbsp;
            </span>
            <div className="relative min-w-0 flex-1">
              <textarea
                ref={textareaRef}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className={`w-full resize-none overflow-hidden bg-transparent font-[var(--font-mono)] text-[13px] leading-6 text-[var(--foreground)] outline-none p-0 m-0 ${showCursorBlink ? "caret-transparent" : "caret-[var(--foreground)]"}`}
                onBlur={() => setInputFocused(false)}
                onChange={handleTextareaChange}
                onFocus={() => setInputFocused(true)}
                onKeyDown={handleKeyDown}
                onPaste={(e) => {
                  const files = e.clipboardData?.files;
                  if (files && files.length > 0) {
                    const hasImages = Array.from(files).some((f) => f.type.startsWith("image/"));
                    if (hasImages) {
                      e.preventDefault();
                      addImagesFromFiles(files);
                    }
                  }
                }}
                placeholder={planMode ? "plan mode — shift+tab to exit" : ""}
                rows={1}
                style={{ height: "auto" }}
                value={draftPrompt}
              />
              {showCursorBlink ? (
                <span className="agent-cursor-blink pointer-events-none absolute left-0 top-[5px] h-[14px] w-[7px] bg-[var(--foreground)]" />
              ) : null}
            </div>
          </div>
          {visibleError ? (
            <div className="px-4 pb-1 text-[12px] text-[var(--destructive)]">
              <span>[!]</span> {visibleError}
            </div>
          ) : null}
        </div>

        <AgentStatusBar
          providerName={provider.name}
          ProviderIcon={provider.Icon}
          responseReady={state.responseReady}
          providerStatus={state.providerStatus}
          permissions={provider.permissions}
          model={provider.model}
          reasoning={provider.reasoning}
          catalogLoading={modelCatalog.isLoading}
          catalogError={modelCatalog.error}
          usage={state.usage}
        />

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
}
