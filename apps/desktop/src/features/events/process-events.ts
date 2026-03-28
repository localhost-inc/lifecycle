import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { publishBrowserLifecycleEvent } from "@/features/events/lifecycle-events";

export const PROCESS_EVENT_NAME = "process:event";

export type ProcessEventKind = "process.log" | "process.exit";

export interface ProcessLogEvent {
  id: string;
  occurred_at: string;
  kind: "process.log";
  process_id: string;
  stream: "stdout" | "stderr";
  line: string;
}

export interface ProcessExitEvent {
  id: string;
  occurred_at: string;
  kind: "process.exit";
  process_id: string;
  exit_code: number | null;
}

export type ProcessEvent = ProcessLogEvent | ProcessExitEvent;

/**
 * Parse a process_id into workspace context. Convention:
 * - `"{workspaceId}:{serviceName}"` for workspace services
 * - Plain IDs like `"db-server"` for non-workspace processes
 */
function parseWorkspaceProcessId(
  processId: string,
): { workspaceId: string; serviceName: string } | null {
  const separator = processId.indexOf(":");
  if (separator === -1) {
    return null;
  }
  return {
    workspaceId: processId.slice(0, separator),
    serviceName: processId.slice(separator + 1),
  };
}

const processEventListeners = new Set<(event: ProcessEvent) => void>();

/**
 * Subscribe to raw process events (all process IDs).
 */
export async function subscribeToProcessEvents(
  listener: (event: ProcessEvent) => void,
): Promise<UnlistenFn> {
  processEventListeners.add(listener);
  return () => {
    processEventListeners.delete(listener);
  };
}

function handleProcessEvent(event: ProcessEvent): void {
  // Notify raw listeners.
  for (const listener of processEventListeners) {
    listener(event);
  }

  // Bridge workspace-scoped process events into lifecycle events.
  const context = parseWorkspaceProcessId(event.process_id);
  if (!context) {
    return;
  }

  if (event.kind === "process.log") {
    publishBrowserLifecycleEvent({
      kind: "service.log.line",
      workspaceId: context.workspaceId,
      name: context.serviceName,
      stream: event.stream,
      line: event.line,
    });
  } else if (event.kind === "process.exit") {
    publishBrowserLifecycleEvent({
      kind: "service.process.exited",
      workspaceId: context.workspaceId,
      name: context.serviceName,
      exitCode: event.exit_code,
    });
  }
}

let globalUnlisten: UnlistenFn | null = null;

/**
 * Start listening to Tauri `process:event` and bridging workspace-scoped
 * events into the lifecycle event system. Call once at app startup.
 */
export async function startProcessEventBridge(): Promise<void> {
  if (globalUnlisten) {
    return;
  }

  if (!isTauri()) {
    return;
  }

  globalUnlisten = await listen<ProcessEvent>(PROCESS_EVENT_NAME, (event) => {
    handleProcessEvent(event.payload);
  });
}

/**
 * Stop the process event bridge. Called on app teardown.
 */
export function stopProcessEventBridge(): void {
  globalUnlisten?.();
  globalUnlisten = null;
}
