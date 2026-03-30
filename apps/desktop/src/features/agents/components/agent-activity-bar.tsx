import { useEffect, useRef, useState } from "react";
import { Logo, Shimmer } from "@lifecycle/ui";
import type { AgentTurnActivity } from "@lifecycle/agents";

function formatTurnActivity(activity: AgentTurnActivity | null): string {
  if (!activity) return "Working";
  switch (activity.phase) {
    case "thinking":
      return "Thinking";
    case "responding":
      return "Writing";
    case "tool_use": {
      switch (activity.toolName) {
        case "Grep":
        case "Glob":
          return "Searching";
        case "Read":
          return "Reading";
        case "Edit":
          return "Editing";
        case "Write":
          return "Writing";
        case "Delete":
        case "DeleteFile":
          return "Deleting";
        case "Bash":
        case "command_execution":
          return "Running command";
        case "Agent":
          return "Delegating";
        default:
          return activity.toolName ? `Running ${activity.toolName}` : "Working";
      }
    }
    default:
      return "Working";
  }
}

function useElapsedSeconds(running: boolean): number {
  const startRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) {
      startRef.current = null;
      setElapsed(0);
      return;
    }

    if (startRef.current === null) {
      startRef.current = Date.now();
    }
    setElapsed(0);

    const interval = setInterval(() => {
      setElapsed(Math.round((Date.now() - (startRef.current ?? Date.now())) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [running]);

  return elapsed;
}

export interface AgentActivityBarProps {
  turnActivity: AgentTurnActivity | null;
  queuedMessageCount?: number;
  visible?: boolean;
}

export function AgentActivityBar({
  turnActivity,
  queuedMessageCount = 0,
  visible = true,
}: AgentActivityBarProps) {
  const elapsedSeconds = useElapsedSeconds(visible);

  return (
    <div
      className="grid transition-[grid-template-rows] duration-150 ease-out"
      style={{ gridTemplateRows: visible ? "1fr" : "0fr" }}
    >
      <div className="overflow-hidden">
        <div className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] text-[var(--muted-foreground)]">
          <Logo
            aria-hidden
            className="lifecycle-motion-soft-pulse shrink-0 text-[var(--foreground)]/70"
            size={10}
          />
          <Shimmer as="span" duration={2} spread={2} className="text-[12px]">
            {formatTurnActivity(turnActivity)}
          </Shimmer>
          <span className="text-[var(--muted-foreground)]/40">
            {elapsedSeconds}s{queuedMessageCount > 0 ? ` · ${queuedMessageCount} queued` : ""}
            {" · esc to interrupt"}
          </span>
        </div>
      </div>
    </div>
  );
}
