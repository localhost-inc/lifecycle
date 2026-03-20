import type { LifecycleEvent, LifecycleEventKind } from "@lifecycle/contracts";

export interface WorkspaceActivityItem {
  detail: string | null;
  id: string;
  kind: LifecycleEvent["kind"];
  occurredAt: string;
  title: string;
  tone: "neutral" | "danger" | "success" | "warning";
}

export const WORKSPACE_ACTIVITY_EVENT_KINDS = [
  "environment.status_changed",
  "workspace.renamed",
  "workspace.deleted",
  "service.log_line",
  "service.status_changed",
  "terminal.created",
  "terminal.status_changed",
  "terminal.renamed",
  "terminal.harness_prompt_submitted",
  "terminal.harness_turn_completed",
  "git.status_changed",
  "git.head_changed",
  "git.log_changed",
] as const satisfies readonly LifecycleEventKind[];

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
    case "environment.status_changed":
      return {
        detail: event.failure_reason ? humanizeToken(event.failure_reason) : null,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurred_at,
        title: `Environment ${humanizeToken(event.status).toLowerCase()}`,
        tone:
          event.failure_reason !== null
            ? "danger"
            : event.status === "running"
              ? "success"
              : event.status === "starting" || event.status === "stopping"
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
        title: `Service ${event.name} ${humanizeToken(event.status).toLowerCase()}`,
        tone:
          event.status === "failed"
            ? "danger"
            : event.status === "ready"
              ? "success"
              : event.status === "stopped"
                ? "warning"
                : "neutral",
      };
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

export function shouldRefreshWorkspaceActivity(
  event: LifecycleEvent,
  workspaceId: string,
): boolean {
  return event.workspace_id === workspaceId && event.kind !== "service.log_line";
}

export function buildWorkspaceActivityItems(
  events: LifecycleEvent[] | undefined,
): WorkspaceActivityItem[] {
  return (events ?? [])
    .map((event) => summarizeWorkspaceActivity(event))
    .filter((item): item is WorkspaceActivityItem => item !== null);
}
