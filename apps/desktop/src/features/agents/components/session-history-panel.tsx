import type { AgentSessionProviderId, AgentSessionRecord } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { useAgentSessions } from "@/features/agents/hooks";
import { useAgentStatusIndex } from "@lifecycle/agents/react";
import { formatCompactRelativeTime } from "@/lib/format";
import { ClaudeIcon, CodexIcon } from "@/features/workspaces/surfaces/surface-icons";
import {
  getWorkspaceSessionStatusState,
  WorkspaceSessionStatus,
} from "@/features/workspaces/surfaces/workspace-session-status";

interface SessionHistoryPanelProps {
  onOpenAgentSession: (session: {
    id: string;
    provider: AgentSessionProviderId;
    title: string;
  }) => void;
  workspaceId: string;
}

function providerIcon(provider: AgentSessionProviderId) {
  return provider === "claude" ? <ClaudeIcon size={13} /> : <CodexIcon size={13} />;
}

function activityTime(session: AgentSessionRecord): string {
  if (session.last_message_at) {
    return formatCompactRelativeTime(session.last_message_at);
  }

  return formatCompactRelativeTime(session.created_at);
}

export function SessionHistoryPanel({ onOpenAgentSession, workspaceId }: SessionHistoryPanelProps) {
  const sessions = useAgentSessions(workspaceId);
  const { isAgentSessionResponseReady, isAgentSessionRunning } = useAgentStatusIndex();

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 pt-2 pb-4">
        {sessions.length > 0 ? (
          <ul className="space-y-0.5">
            {sessions.map((session) => {
              const sessionStatusState = getWorkspaceSessionStatusState({
                responseReady: isAgentSessionResponseReady(session.id),
                running: isAgentSessionRunning(session.id),
              });

              return (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => onOpenAgentSession(session)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--muted-foreground)]">
                      {providerIcon(session.provider)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--foreground)]">
                      {session.title || "New Session"}
                    </span>
                    {sessionStatusState !== "hidden" ? (
                      <WorkspaceSessionStatus
                        className="min-w-4 justify-center"
                        state={sessionStatusState}
                      />
                    ) : (
                      <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]/60">
                        {activityTime(session)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-2.5 py-4">
            <EmptyState
              description="Agent sessions for this workspace will appear here."
              size="sm"
              title="No sessions yet"
            />
          </div>
        )}
      </div>
    </section>
  );
}
