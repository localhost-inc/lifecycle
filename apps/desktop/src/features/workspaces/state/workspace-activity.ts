import type { LifecycleEvent, LifecycleEventKind } from "@lifecycle/contracts";
import type { QueryUpdate } from "../../../query";

export interface WorkspaceActivityItem {
  detail: string | null;
  id: string;
  kind: LifecycleEvent["kind"];
  occurredAt: string;
  title: string;
  tone: "neutral" | "danger" | "success" | "warning";
}

export const WORKSPACE_ACTIVITY_EVENT_KINDS = [
  "workspace.status_changed",
  "workspace.renamed",
  "workspace.deleted",
  "workspace.manifest_synced",
  "service.configuration_changed",
  "service.log_line",
  "service.status_changed",
  "workspace.setup_progress",
  "environment.task_progress",
  "terminal.created",
  "terminal.status_changed",
  "terminal.renamed",
  "terminal.harness_prompt_submitted",
  "terminal.harness_turn_completed",
  "git.status_changed",
  "git.head_changed",
  "git.log_changed",
] as const satisfies readonly LifecycleEventKind[];

const WORKSPACE_ACTIVITY_LIMIT = 32;

function capitalizeWord(value: string): string {
  if (!value) {
    return value;
  }

  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function humanizeToken(value: string): string {
  return value
    .split("_")
    .map((part) => capitalizeWord(part))
    .join(" ");
}

function trimActivityText(value: string, limit = 88): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 3).trimEnd()}...`;
}

function providerLabel(provider: string | null): string {
  if (provider === "claude") {
    return "Claude";
  }

  if (provider === "codex") {
    return "Codex";
  }

  return "Harness";
}

function terminalLaunchLabel(
  launchType: "command" | "harness" | "preset" | "shell",
  provider: string | null,
): string {
  if (launchType === "harness") {
    return providerLabel(provider);
  }

  if (launchType === "shell") {
    return "Shell";
  }

  return capitalizeWord(launchType);
}

function shortValue(value: string | null, length = 8): string | null {
  if (!value) {
    return null;
  }

  return value.slice(0, length);
}

function joinActivityDetail(parts: Array<string | null | undefined>): string | null {
  const next = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part && part.length > 0));

  return next.length > 0 ? next.join(" · ") : null;
}

function gitRefDetail(
  branch: string | null,
  headSha: string | null,
  upstream: string | null,
): string | null {
  return joinActivityDetail([
    branch ? `branch ${branch}` : null,
    shortValue(headSha) ? `head ${shortValue(headSha)}` : null,
    upstream ? `upstream ${upstream}` : null,
  ]);
}

function summarizeWorkspaceActivity(event: LifecycleEvent): WorkspaceActivityItem | null {
  switch (event.kind) {
    case "workspace.status_changed":
      return {
        detail: event.failure_reason ? humanizeToken(event.failure_reason) : null,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        title: `Workspace ${humanizeToken(event.status).toLowerCase()}`,
        tone:
          event.failure_reason !== null
            ? "danger"
            : event.status === "active"
              ? "success"
              : event.status === "stopping"
                ? "warning"
                : "neutral",
      };
    case "workspace.renamed":
      return {
        detail: event.name,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        title: "Workspace renamed",
        tone: "neutral",
      };
    case "workspace.deleted":
      return {
        detail: null,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        title: "Workspace archived",
        tone: "warning",
      };
    case "service.status_changed":
      return {
        detail: event.status_reason ? humanizeToken(event.status_reason) : null,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        title: `Service ${event.service_name} ${humanizeToken(event.status).toLowerCase()}`,
        tone:
          event.status === "failed"
            ? "danger"
            : event.status === "ready"
              ? "success"
              : event.status === "stopped"
                ? "warning"
                : "neutral",
      };
    case "service.configuration_changed":
      return {
        detail: joinActivityDetail([
          `exposure ${event.service.exposure}`,
          event.service.preview_status !== "disabled"
            ? `preview ${humanizeToken(event.service.preview_status).toLowerCase()}`
            : null,
        ]),
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        title: `Service ${event.service.service_name} configuration updated`,
        tone: "neutral",
      };
    case "workspace.manifest_synced":
      return {
        detail: joinActivityDetail([
          event.manifest_fingerprint,
          `${event.services.length} service${event.services.length === 1 ? "" : "s"}`,
        ]),
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        title: "Workspace manifest synced",
        tone: "neutral",
      };
    case "workspace.setup_progress":
    case "environment.task_progress": {
      const label = event.kind === "workspace.setup_progress" ? "Setup" : "Task";
      switch (event.event_kind) {
        case "stdout":
          return null;
        case "stderr":
          return {
            detail: event.data ? trimActivityText(event.data) : null,
            id: event.id,
            kind: event.kind,
            occurredAt: event.occurred_at,
            title: `${label} ${event.step_name} stderr`,
            tone: "warning",
          };
        case "started":
          return {
            detail: null,
            id: event.id,
            kind: event.kind,
            occurredAt: event.occurred_at,
            title: `${label} ${event.step_name} started`,
            tone: "neutral",
          };
        case "completed":
          return {
            detail: null,
            id: event.id,
            kind: event.kind,
            occurredAt: event.occurred_at,
            title: `${label} ${event.step_name} completed`,
            tone: "success",
          };
        case "failed":
          return {
            detail: event.data ? trimActivityText(event.data) : null,
            id: event.id,
            kind: event.kind,
            occurredAt: event.occurred_at,
            title: `${label} ${event.step_name} failed`,
            tone: "danger",
          };
        case "timeout":
          return {
            detail: null,
            id: event.id,
            kind: event.kind,
            occurredAt: event.occurred_at,
            title: `${label} ${event.step_name} timed out`,
            tone: "warning",
          };
        default:
          return null;
      }
    }
    case "terminal.created":
      return {
        detail: event.terminal.label,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        title: `${terminalLaunchLabel(
          event.terminal.launch_type,
          event.terminal.harness_provider,
        )} session started`,
        tone: "success",
      };
    case "service.log_line":
      return null;
    case "terminal.updated":
      return null;
    case "terminal.status_changed":
      return {
        detail: joinActivityDetail([
          event.failure_reason ? humanizeToken(event.failure_reason) : null,
          typeof event.exit_code === "number" ? `exit ${event.exit_code}` : null,
        ]),
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        title: `Session ${humanizeToken(event.status).toLowerCase()}`,
        tone:
          event.status === "failed"
            ? "danger"
            : event.status === "finished"
              ? "warning"
              : event.status === "active"
                ? "success"
                : "neutral",
      };
    case "terminal.renamed":
      return {
        detail: event.label,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        title: "Session renamed",
        tone: "neutral",
      };
    case "terminal.harness_prompt_submitted":
      return {
        detail: trimActivityText(event.prompt_text),
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        title: `${providerLabel(event.harness_provider)} prompt submitted`,
        tone: "neutral",
      };
    case "terminal.harness_turn_completed":
      return {
        detail: shortValue(event.harness_session_id)
          ? `session ${shortValue(event.harness_session_id)}`
          : null,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        title: `${providerLabel(event.harness_provider)} turn completed`,
        tone: "success",
      };
    case "git.status_changed":
      return {
        detail: gitRefDetail(event.branch, event.head_sha, event.upstream),
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        title: "Git status refreshed",
        tone: "neutral",
      };
    case "git.head_changed":
      return {
        detail: joinActivityDetail([
          gitRefDetail(event.branch, event.head_sha, event.upstream),
          event.ahead !== null || event.behind !== null
            ? `ahead ${event.ahead ?? 0} / behind ${event.behind ?? 0}`
            : null,
        ]),
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        title: "Git head updated",
        tone: "neutral",
      };
    case "git.log_changed":
      return {
        detail: gitRefDetail(event.branch, event.head_sha, null),
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        title: "Git history updated",
        tone: "neutral",
      };
    default:
      return null;
  }
}

function eventContributesToWorkspaceActivity(event: LifecycleEvent): boolean {
  if (event.kind === "service.log_line") {
    return false;
  }

  return !(
    (event.kind === "workspace.setup_progress" || event.kind === "environment.task_progress") &&
    (event.event_kind === "stdout" || event.event_kind === "stderr")
  );
}

export function reduceWorkspaceActivityEvents(
  current: LifecycleEvent[],
  event: LifecycleEvent,
  workspaceId: string,
): LifecycleEvent[] {
  if (event.workspace_id !== workspaceId || !eventContributesToWorkspaceActivity(event)) {
    return current;
  }

  return [event, ...current.filter((item) => item.id !== event.id)].slice(
    0,
    WORKSPACE_ACTIVITY_LIMIT,
  );
}

export function buildWorkspaceActivityItems(
  events: LifecycleEvent[] | undefined,
): WorkspaceActivityItem[] {
  return (events ?? [])
    .map((event) => summarizeWorkspaceActivity(event))
    .filter((item): item is WorkspaceActivityItem => item !== null);
}

export function reduceWorkspaceActivity(
  current: WorkspaceActivityItem[] | undefined,
  event: LifecycleEvent,
  workspaceId: string,
): QueryUpdate<WorkspaceActivityItem[]> {
  if (event.workspace_id !== workspaceId) {
    return { kind: "none" };
  }

  const activity = summarizeWorkspaceActivity(event);
  if (!activity) {
    return { kind: "none" };
  }

  return {
    kind: "replace",
    data: [activity, ...(current ?? []).filter((item) => item.id !== activity.id)].slice(
      0,
      WORKSPACE_ACTIVITY_LIMIT,
    ),
  };
}
