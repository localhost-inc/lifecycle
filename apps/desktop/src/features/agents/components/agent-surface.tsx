import { EmptyState, themeAppearance } from "@lifecycle/ui";
import { Bot, CornerDownLeft } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  useAgentSession,
  useAgentSessionMessages,
  useInvalidateAgentSessionMessages,
} from "@/features/agents/hooks";
import { sendDesktopAgentTextTurn } from "@/features/agents/runtime/desktop-agent-orchestrator";
import { useAgentSessionRefresh, useRuntime } from "@/store";
import { useLifecycleEvent } from "@/features/events";
import {
  syncNativeTerminalSurface,
  type NativeTerminalTheme,
} from "@/features/terminals/native-surface-api";
import { useTerminalResponseReady } from "@/features/terminals/state/terminal-response-ready-provider";
import { DEFAULT_TERMINAL_FONT_SIZE } from "@/features/terminals/terminal-display";
import { resolveTerminalTheme } from "@/features/terminals/terminal-theme";
import { useSettings } from "@/features/settings/state/settings-provider";
import { getNativeMonospaceFontFamily } from "@/lib/typography";
import { ClaudeIcon, CodexIcon } from "@/features/workspaces/components/surface-icons";

function backendLabel(backend: "claude" | "codex"): string {
  return backend === "claude" ? "Claude" : "Codex";
}

function MessageIcon({
  backend,
  role,
}: {
  backend: "claude" | "codex";
  role: "assistant" | "user";
}) {
  if (role === "assistant") {
    return backend === "claude" ? <ClaudeIcon size={14} /> : <CodexIcon size={14} />;
  }

  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-hover)] text-[10px] font-semibold uppercase text-[var(--muted-foreground)]">
      U
    </span>
  );
}

function roleLabel(
  backend: "claude" | "codex",
  role: "assistant" | "user",
): { label: string; tone: string } {
  if (role === "assistant") {
    return {
      label: backendLabel(backend).toLowerCase(),
      tone: "text-[var(--accent-foreground)]",
    };
  }

  return {
    label: "you",
    tone: "text-[var(--muted-foreground)]",
  };
}

function readHiddenTerminalTheme(resolvedTheme: ReturnType<typeof useSettings>["resolvedTheme"]): {
  appearance: "dark" | "light";
  theme: NativeTerminalTheme;
} {
  if (typeof document === "undefined") {
    return {
      appearance: "dark",
      theme: {
        background: "#111113",
        cursorColor: "#87b2cf",
        foreground: "#fafaf9",
        palette: [],
        selectionBackground: "#27272a",
        selectionForeground: "#fafaf9",
      },
    };
  }

  const theme = resolveTerminalTheme(document.documentElement, resolvedTheme);
  return {
    appearance: themeAppearance(resolvedTheme),
    theme,
  };
}

interface AgentSurfaceProps {
  agentSessionId: string;
  workspaceId: string;
}

export function AgentSurface({ agentSessionId, workspaceId }: AgentSurfaceProps) {
  const runtime = useRuntime();
  const session = useAgentSession(workspaceId, agentSessionId);
  const messagesQuery = useAgentSessionMessages(agentSessionId);
  const invalidateMessages = useInvalidateAgentSessionMessages();
  const refreshAgentSessions = useAgentSessionRefresh(workspaceId);
  const messages = messagesQuery.data ?? [];
  const { isTerminalTurnRunning } = useTerminalResponseReady();
  const { monospaceFontFamily, resolvedTheme } = useSettings();
  const [draftPrompt, setDraftPrompt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const runtimeStartPromiseRef = useRef<Promise<void> | null>(null);
  const runtimeTerminalIdRef = useRef<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const runtimeTerminalId = session?.runtime_session_id?.trim() || null;
  const canSend = draftPrompt.trim().length > 0 && !isSending;
  const isRunning =
    isSending || (runtimeTerminalId ? isTerminalTurnRunning(runtimeTerminalId) : false);
  const renderedMessages = useMemo(
    () =>
      messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.text,
      })),
    [messages],
  );

  const ensureRuntimeStarted = useCallback(async (): Promise<void> => {
    if (!runtimeTerminalId) {
      return;
    }

    if (runtimeTerminalIdRef.current === runtimeTerminalId && runtimeStartPromiseRef.current) {
      await runtimeStartPromiseRef.current;
      return;
    }

    const { appearance, theme } = readHiddenTerminalTheme(resolvedTheme);
    const fontFamily = getNativeMonospaceFontFamily(monospaceFontFamily);
    const startPromise = syncNativeTerminalSurface({
      appearance,
      focused: false,
      fontFamily,
      fontSize: DEFAULT_TERMINAL_FONT_SIZE,
      height: 2,
      opacity: 1,
      pointerPassthrough: true,
      scaleFactor: typeof window === "undefined" ? 1 : Math.max(window.devicePixelRatio || 1, 1),
      terminalId: runtimeTerminalId,
      theme,
      visible: false,
      width: 2,
      x: -10_000,
      y: -10_000,
    });

    runtimeTerminalIdRef.current = runtimeTerminalId;
    runtimeStartPromiseRef.current = startPromise;
    await startPromise;
  }, [monospaceFontFamily, resolvedTheme, runtimeTerminalId]);

  useEffect(() => {
    runtimeStartPromiseRef.current = null;
    runtimeTerminalIdRef.current = null;
  }, [runtimeTerminalId]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) {
      return;
    }

    transcript.scrollTop = transcript.scrollHeight;
  }, [isRunning, renderedMessages]);

  useEffect(() => {
    void ensureRuntimeStarted().catch(() => undefined);
  }, [ensureRuntimeStarted]);

  useLifecycleEvent(
    [
      "terminal.updated",
      "terminal.status_changed",
      "terminal.harness_prompt_submitted",
      "terminal.harness_turn_completed",
    ],
    (event) => {
      if (!runtimeTerminalId) {
        return;
      }

      const eventTerminalId = "terminal_id" in event ? event.terminal_id : event.terminal.id;
      if (eventTerminalId !== runtimeTerminalId) {
        return;
      }

      invalidateMessages(agentSessionId);
      if (event.kind === "terminal.updated") {
        refreshAgentSessions();
      }
    },
  );

  async function handleSend(): Promise<void> {
    const prompt = draftPrompt.trim();
    if (prompt.length === 0 || isSending) {
      return;
    }

    setIsSending(true);
    setSendError(null);

    try {
      await ensureRuntimeStarted();
      await sendDesktopAgentTextTurn({
        runtime,
        prompt,
        sessionId: agentSessionId,
        workspaceId,
      });
      setDraftPrompt("");
      invalidateMessages(agentSessionId);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to send prompt.");
    } finally {
      setIsSending(false);
    }
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      void handleSend();
    }
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

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--terminal-surface,var(--surface))]">
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/80 px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--foreground)]">
            {session.backend === "claude" ? <ClaudeIcon size={14} /> : <CodexIcon size={14} />}
            <span className="truncate">{session.title}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 font-[var(--font-family-mono)] text-[11px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
            <span>{backendLabel(session.backend)}</span>
            <span className="text-[var(--border)]">/</span>
            <span>{session.runtime_kind}</span>
            <span className="text-[var(--border)]">/</span>
            <span>{runtimeTerminalId ? "bound" : "unbound"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 font-[var(--font-family-mono)] text-[11px] uppercase tracking-[0.08em]">
          <span
            className={[
              "inline-flex items-center gap-2 border px-2 py-1",
              isRunning
                ? "border-[var(--accent)] text-[var(--foreground)]"
                : "border-[var(--border)] text-[var(--muted-foreground)]",
            ].join(" ")}
          >
            <span
              className={[
                "inline-block h-1.5 w-1.5 rounded-full",
                isRunning ? "bg-[var(--accent)]" : "bg-[var(--muted-foreground)]/60",
              ].join(" ")}
            />
            {isRunning ? "Running" : "Idle"}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={transcriptRef}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[linear-gradient(to_bottom,var(--surface)_0%,transparent_16px)] px-4 py-4 font-[var(--font-family-mono)]"
        >
          {renderedMessages.length > 0 ? (
            renderedMessages.map((message) => (
              <article
                key={message.id}
                className="border-b border-[var(--border)]/70 py-3 last:border-b-0"
              >
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                  <MessageIcon backend={session.backend} role={message.role} />
                  <span className={roleLabel(session.backend, message.role).tone}>
                    {roleLabel(session.backend, message.role).label}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap break-words pl-7 text-[13px] leading-6 text-[var(--foreground)]">
                  {message.text}
                </pre>
              </article>
            ))
          ) : (
            <div className="flex flex-1 items-center justify-center border border-dashed border-[var(--border)] bg-[var(--surface)]/40 px-6 py-8">
              <div className="max-w-xl space-y-2 font-[var(--font-family-mono)] text-center">
                <p className="text-[12px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  Agent transcript
                </p>
                <p className="text-[13px] leading-6 text-[var(--foreground)]">
                  Type a prompt below to start the session. Replies will stream into this document
                  from the bound harness runtime.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <div className="border border-[var(--border)] bg-[var(--background)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 font-[var(--font-family-mono)] text-[11px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
              <span>Prompt buffer</span>
              <span>{backendLabel(session.backend)}</span>
            </div>
            <div className="flex items-start gap-3 px-3 py-3">
              <span className="pt-1 font-[var(--font-family-mono)] text-[13px] font-semibold text-[var(--accent)]">
                &gt;
              </span>
              <textarea
                className="min-h-28 w-full resize-none bg-transparent py-0.5 font-[var(--font-family-mono)] text-[13px] leading-6 text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
                onChange={(event) => setDraftPrompt(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={`Ask ${backendLabel(session.backend)} to inspect the workspace, explain a file, or make a change.`}
                value={draftPrompt}
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-3 py-2">
              <div className="flex items-center gap-2 font-[var(--font-family-mono)] text-[11px] text-[var(--muted-foreground)]">
                <CornerDownLeft className="size-3" />
                <span>Enter sends</span>
                <span className="text-[var(--border)]">/</span>
                <span>Shift+Enter newline</span>
              </div>
              <button
                className={[
                  "inline-flex items-center gap-2 border px-3 py-1.5 font-[var(--font-family-mono)] text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors",
                  canSend
                    ? "border-[var(--accent)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
                    : "border-[var(--border)] text-[var(--muted-foreground)]",
                ].join(" ")}
                disabled={!canSend}
                onClick={() => void handleSend()}
                type="button"
              >
                <span>{isSending ? "Sending" : "Send"}</span>
              </button>
            </div>
          </div>
          {sendError ? (
            <p className="mt-2 font-[var(--font-family-mono)] text-[12px] text-[var(--destructive)]">
              {sendError}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
