import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  LifecycleEvent,
  LifecycleEventInput,
  LifecycleEventOf,
  LifecycleEventKind,
  LifecycleEventWire,
} from "@lifecycle/contracts";
import type { ServiceLogSnapshot } from "@lifecycle/workspace/client";

export const LIFECYCLE_EVENT_NAME = "lifecycle:event";

const MAX_ACTIVITY_EVENTS_PER_WORKSPACE = 200;
const MAX_SERVICE_LOG_LINES_PER_SERVICE = 500;
const WORKSPACE_ACTIVITY_EVENT_KINDS = new Set<LifecycleEventKind>([
  "workspace.status.changed",
  "workspace.renamed",
  "workspace.archived",
  "service.status.changed",
  "git.status.changed",
  "git.head.changed",
  "git.log.changed",
]);

type LifecycleListener = (event: LifecycleEvent) => void;
type ServiceLogLine = ServiceLogSnapshot["lines"][number];

const hotData = import.meta.hot?.data as
  | {
      activityEventsByWorkspace?: Map<string, LifecycleEvent[]>;
      serviceLogLinesByWorkspace?: Map<string, Map<string, ServiceLogLine[]>>;
    }
  | undefined;

let activityEventsByWorkspace =
  hotData?.activityEventsByWorkspace ?? new Map<string, LifecycleEvent[]>();
let serviceLogLinesByWorkspace =
  hotData?.serviceLogLinesByWorkspace ?? new Map<string, Map<string, ServiceLogLine[]>>();

const lifecycleListeners = new Set<LifecycleListener>();
let nativeLifecycleUnlisten: UnlistenFn | null = null;
let nativeLifecycleSubscription: Promise<void> | null = null;

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => {
    data.activityEventsByWorkspace = activityEventsByWorkspace;
    data.serviceLogLinesByWorkspace = serviceLogLinesByWorkspace;
    nativeLifecycleUnlisten?.();
    nativeLifecycleUnlisten = null;
    nativeLifecycleSubscription = null;
  });
}

function appendWorkspaceActivityEvent(event: LifecycleEvent): void {
  if (!("workspaceId" in event) || !WORKSPACE_ACTIVITY_EVENT_KINDS.has(event.kind)) {
    return;
  }

  const existing = activityEventsByWorkspace.get(event.workspaceId) ?? [];
  const nextEvents =
    existing.length >= MAX_ACTIVITY_EVENTS_PER_WORKSPACE
      ? [...existing.slice(1), event]
      : [...existing, event];
  activityEventsByWorkspace.set(event.workspaceId, nextEvents);
}

function appendWorkspaceServiceLogEvent(event: LifecycleEvent): void {
  if (event.kind !== "service.log.line") {
    return;
  }

  const workspaceLogs = serviceLogLinesByWorkspace.get(event.workspaceId) ?? new Map();
  const existing = workspaceLogs.get(event.name) ?? [];
  const nextLines =
    existing.length >= MAX_SERVICE_LOG_LINES_PER_SERVICE
      ? [...existing.slice(1), { stream: event.stream, text: event.line }]
      : [...existing, { stream: event.stream, text: event.line }];
  workspaceLogs.set(event.name, nextLines);
  serviceLogLinesByWorkspace.set(event.workspaceId, workspaceLogs);
}

function recordLifecycleEvent(event: LifecycleEvent): void {
  appendWorkspaceActivityEvent(event);
  appendWorkspaceServiceLogEvent(event);
}

function emitLifecycleEvent(event: LifecycleEvent): void {
  recordLifecycleEvent(event);
  for (const listener of lifecycleListeners) {
    listener(event);
  }
}

async function ensureNativeLifecycleSubscription(): Promise<void> {
  if (!isTauri()) {
    return;
  }

  if (nativeLifecycleUnlisten) {
    return;
  }

  if (!nativeLifecycleSubscription) {
    nativeLifecycleSubscription = listen<LifecycleEventWire>(LIFECYCLE_EVENT_NAME, (event) => {
      emitLifecycleEvent(normalizeLifecycleEvent(event.payload));
    }).then((unlisten) => {
      nativeLifecycleUnlisten = unlisten;
    });
  }

  await nativeLifecycleSubscription;
}

function normalizeLifecycleEvent(event: LifecycleEventWire): LifecycleEvent {
  switch (event.kind) {
    case "workspace.status.changed":
      return {
        failureReason: event.failure_reason,
        failedAt: event.failed_at,
        gitSha: event.git_sha,
        id: event.id,
        kind: event.kind,
        manifestFingerprint: event.manifest_fingerprint,
        occurredAt: event.occurred_at,
        status: event.status,
        worktreePath: event.worktree_path,
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
    case "workspace.archived":
      return {
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        workspaceId: event.workspace_id,
      };
    case "workspace.file.changed":
      return {
        filePath: event.file_path,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        workspaceId: event.workspace_id,
      };
    case "service.status.changed":
      return {
        assignedPort: event.assigned_port,
        id: event.id,
        kind: event.kind,
        name: event.name,
        occurredAt: event.occurred_at,
        status: event.status,
        statusReason: event.status_reason,
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
    case "service.process.exited":
      return {
        exitCode: event.exit_code,
        id: event.id,
        kind: event.kind,
        name: event.name,
        occurredAt: event.occurred_at,
        workspaceId: event.workspace_id,
      };
    case "service.log.line":
      return {
        id: event.id,
        kind: event.kind,
        line: event.line,
        name: event.name,
        occurredAt: event.occurred_at,
        stream: event.stream,
        workspaceId: event.workspace_id,
      };
    case "git.status.changed":
      return {
        branch: event.branch,
        headSha: event.head_sha,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        upstream: event.upstream,
        workspaceId: event.workspace_id,
      };
    case "git.head.changed":
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
    case "git.log.changed":
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

  emitLifecycleEvent(nextEvent);

  return nextEvent;
}

export function getWorkspaceActivityEvents(workspaceId: string): LifecycleEvent[] {
  return [...(activityEventsByWorkspace.get(workspaceId) ?? [])];
}

export function getWorkspaceServiceLogs(workspaceId: string): ServiceLogSnapshot[] {
  const workspaceLogs = serviceLogLinesByWorkspace.get(workspaceId);
  if (!workspaceLogs) {
    return [];
  }

  return [...workspaceLogs.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, lines]) => ({
      name,
      lines: [...lines],
    }));
}

export function resetLifecycleEventStoreForTests(): void {
  activityEventsByWorkspace = new Map();
  serviceLogLinesByWorkspace = new Map();
  lifecycleListeners.clear();
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

  lifecycleListeners.add(handleEvent);
  await ensureNativeLifecycleSubscription();

  return () => {
    lifecycleListeners.delete(handleEvent);
  };
}
