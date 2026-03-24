import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  LifecycleEvent,
  LifecycleEventInput,
  LifecycleEventOf,
  LifecycleEventKind,
  LifecycleEventWire,
} from "@lifecycle/contracts";

export const LIFECYCLE_EVENT_NAME = "lifecycle:event";

const browserListeners = new Set<(event: LifecycleEvent) => void>();

function normalizeLifecycleEvent(event: LifecycleEventWire): LifecycleEvent {
  switch (event.kind) {
    case "workspace.status_changed":
      return {
        failureReason: event.failure_reason,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        status: event.status,
        workspaceId: event.workspace_id,
      };
    case "workspace.renamed":
      return {
        id: event.id,
        kind: event.kind,
        name: event.name,
        occurredAt: event.occurred_at,
        sourceRef: event.source_ref,
        workspaceId: event.workspace_id,
        worktreePath: event.worktree_path,
      };
    case "workspace.deleted":
      return {
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        workspaceId: event.workspace_id,
      };
    case "workspace.file_changed":
      return {
        filePath: event.file_path,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        workspaceId: event.workspace_id,
      };
    case "service.status_changed":
      return {
        id: event.id,
        kind: event.kind,
        name: event.name,
        occurredAt: event.occurred_at,
        status: event.status,
        statusReason: event.status_reason,
        workspaceId: event.workspace_id,
      };
    case "terminal.created":
    case "terminal.updated":
      return {
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        terminal: event.terminal,
        workspaceId: event.workspace_id,
      };
    case "terminal.status_changed":
      return {
        endedAt: event.ended_at,
        exitCode: event.exit_code,
        failureReason: event.failure_reason,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        status: event.status,
        terminalId: event.terminal_id,
        workspaceId: event.workspace_id,
      };
    case "terminal.renamed":
      return {
        id: event.id,
        kind: event.kind,
        label: event.label,
        occurredAt: event.occurred_at,
        terminalId: event.terminal_id,
        workspaceId: event.workspace_id,
      };
    case "agent.session.created":
    case "agent.session.updated":
      return {
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        session: event.session,
        workspaceId: event.workspace_id,
      };
    case "agent.turn.completed":
      return {
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        sessionId: event.session_id,
        turnId: event.turn_id,
        workspaceId: event.workspace_id,
      };
    case "service.process_exited":
      return {
        exitCode: event.exit_code,
        id: event.id,
        kind: event.kind,
        name: event.name,
        occurredAt: event.occurred_at,
        workspaceId: event.workspace_id,
      };
    case "service.log_line":
      return {
        id: event.id,
        kind: event.kind,
        line: event.line,
        name: event.name,
        occurredAt: event.occurred_at,
        stream: event.stream,
        workspaceId: event.workspace_id,
      };
    case "git.status_changed":
      return {
        branch: event.branch,
        headSha: event.head_sha,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        upstream: event.upstream,
        workspaceId: event.workspace_id,
      };
    case "git.head_changed":
      return {
        ahead: event.ahead,
        behind: event.behind,
        branch: event.branch,
        headSha: event.head_sha,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        upstream: event.upstream,
        workspaceId: event.workspace_id,
      };
    case "git.log_changed":
      return {
        branch: event.branch,
        headSha: event.head_sha,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        workspaceId: event.workspace_id,
      };
  }
}

function createEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function publishBrowserLifecycleEvent(event: LifecycleEventInput): LifecycleEvent {
  const nextEvent = {
    ...event,
    id: createEventId(),
    occurredAt: new Date().toISOString(),
  } as LifecycleEvent;

  for (const listener of browserListeners) {
    listener(nextEvent);
  }

  return nextEvent;
}

export async function subscribeToLifecycleEvents<Kinds extends readonly LifecycleEventKind[]>(
  kinds: Kinds,
  listener: (event: LifecycleEventOf<Kinds[number]>) => void,
): Promise<UnlistenFn>;
export async function subscribeToLifecycleEvents(
  kinds: readonly LifecycleEventKind[],
  listener: (event: LifecycleEvent) => void,
): Promise<UnlistenFn> {
  if (kinds.length === 0) {
    return () => {};
  }

  const kindSet = new Set(kinds);
  const handleEvent = (event: LifecycleEvent) => {
    if (!kindSet.has(event.kind)) {
      return;
    }

    listener(event);
  };

  if (!isTauri()) {
    browserListeners.add(handleEvent);
    return () => {
      browserListeners.delete(handleEvent);
    };
  }

  return listen<LifecycleEventWire>(LIFECYCLE_EVENT_NAME, (event) => {
    handleEvent(normalizeLifecycleEvent(event.payload));
  });
}
