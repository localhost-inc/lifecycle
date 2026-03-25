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
  "workspace.status.changed",
  "workspace.renamed",
  "workspace.archived",
  "service.log.line",
  "service.status.changed",
  "git.status.changed",
  "git.head.changed",
  "git.log.changed",
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
    case "workspace.status.changed":
      return {
        detail: event.failureReason ? humanizeToken(event.failureReason) : null,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurredAt,
        title: `Workspace ${humanizeToken(event.status).toLowerCase()}`,
        tone:
          event.failureReason !== null
            ? "danger"
            : event.status === "active"
              ? "success"
              : event.status === "archiving"
                ? "warning"
                : "neutral",
      };
    case "workspace.renamed":
      return {
        detail: event.name,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurredAt,
        title: "Workspace renamed",
        tone: "neutral",
      };
    case "workspace.archived":
      return {
        detail: null,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurredAt,
        title: "Workspace archived",
        tone: "warning",
      };
    case "service.status.changed":
      return {
        detail: event.statusReason ? humanizeToken(event.statusReason) : null,
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurredAt,
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
    case "service.log.line":
      return null;
    case "git.status.changed":
      return {
        detail: gitRefDetail(event.branch, event.headSha, event.upstream),
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurredAt,
        title: "Git status refreshed",
        tone: "neutral",
      };
    case "git.head.changed":
      return {
        detail: joinActivityDetail([
          gitRefDetail(event.branch, event.headSha, event.upstream),
          event.ahead !== null || event.behind !== null
            ? `ahead ${event.ahead ?? 0} / behind ${event.behind ?? 0}`
            : null,
        ]),
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurredAt,
        title: "Git head updated",
        tone: "neutral",
      };
    case "git.log.changed":
      return {
        detail: gitRefDetail(event.branch, event.headSha, null),
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurredAt,
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
  return (
    event.workspaceId === workspaceId &&
    event.kind !== "service.log.line" &&
    event.kind !== "workspace.file.changed"
  );
}

export function buildWorkspaceActivityItems(
  events: LifecycleEvent[] | undefined,
): WorkspaceActivityItem[] {
  return (events ?? [])
    .map((event) => summarizeWorkspaceActivity(event))
    .filter((item): item is WorkspaceActivityItem => item !== null);
}
