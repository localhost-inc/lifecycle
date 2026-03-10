import { cn, Spinner } from "@lifecycle/ui";
import { ResponseReadyDot } from "../../../components/response-ready-dot";

export type WorkspaceSessionStatusState = "hidden" | "loading" | "ready";

export function getWorkspaceSessionStatusState({
  responseReady,
  running,
}: {
  responseReady: boolean;
  running: boolean;
}): WorkspaceSessionStatusState {
  if (responseReady) {
    return "ready";
  }

  if (running) {
    return "loading";
  }

  return "hidden";
}

interface WorkspaceSessionStatusProps {
  className?: string;
  state: WorkspaceSessionStatusState;
}

export function WorkspaceSessionStatus({ className, state }: WorkspaceSessionStatusProps) {
  if (state === "hidden") {
    return null;
  }

  return (
    <span
      className={cn("flex min-w-9 shrink-0 justify-end", className)}
      data-slot="workspace-session-status"
    >
      {state === "ready" ? (
        <ResponseReadyDot />
      ) : (
        <span
          aria-label="Generating response"
          className="flex items-center justify-end"
          role="img"
          title="Generating response"
        >
          <Spinner
            aria-hidden="true"
            aria-label={undefined}
            className="size-3.5 text-[var(--sidebar-muted-foreground)]"
            role={undefined}
          />
        </span>
      )}
    </span>
  );
}
