import type { LifecycleEvent, LifecycleEventKind } from "@lifecycle/contracts";
import { gitKeys } from "@/features/git/state/git-query-keys";
import { terminalKeys } from "@/features/terminals/queries";
import {
  shouldRefreshWorkspaceActivity,
  WORKSPACE_ACTIVITY_EVENT_KINDS,
} from "@/features/workspaces/state/workspace-activity";
import { workspaceKeys } from "@/features/workspaces/state/workspace-query-keys";
import type { QueryClient, QueryKey } from "@/query/client";

export type QueryInvalidationTarget =
  | { kind: "exact"; key: QueryKey }
  | { kind: "prefix"; prefix: QueryKey };

const WORKSPACE_RECORD_EVENT_KINDS = [
  "workspace.status_changed",
  "git.head_changed",
  "workspace.renamed",
  "workspace.deleted",
] as const satisfies readonly LifecycleEventKind[];
const WORKSPACE_RECORD_EVENT_KIND_SET = new Set<LifecycleEventKind>(WORKSPACE_RECORD_EVENT_KINDS);

const QUERY_INVALIDATION_EVENT_KINDS_SET = new Set<LifecycleEventKind>([
  ...WORKSPACE_ACTIVITY_EVENT_KINDS,
  ...WORKSPACE_RECORD_EVENT_KINDS,
  "service.status_changed",
  "service.log_line",
  "terminal.created",
  "terminal.updated",
  "terminal.status_changed",
  "terminal.renamed",
  "git.status_changed",
  "git.log_changed",
]);

export const QUERY_INVALIDATION_EVENT_KINDS = [
  ...QUERY_INVALIDATION_EVENT_KINDS_SET,
] satisfies readonly LifecycleEventKind[];

function exact(key: QueryKey): QueryInvalidationTarget {
  return { kind: "exact", key };
}

function prefix(value: QueryKey): QueryInvalidationTarget {
  return { kind: "prefix", prefix: value };
}

function gitLogPrefix(workspaceId: string): QueryKey {
  return ["workspace-git-log", workspaceId];
}

function gitPullRequestPrefix(workspaceId: string): QueryKey {
  return ["workspace-git-pull-request", workspaceId];
}

function isWorkspaceRecordEvent(event: LifecycleEvent): boolean {
  return WORKSPACE_RECORD_EVENT_KIND_SET.has(event.kind);
}

function isTerminalEvent(event: LifecycleEvent): boolean {
  return (
    event.kind === "terminal.created" ||
    event.kind === "terminal.updated" ||
    event.kind === "terminal.status_changed" ||
    event.kind === "terminal.renamed"
  );
}

export function getInvalidationTargetsForLifecycleEvent(
  event: LifecycleEvent,
): QueryInvalidationTarget[] {
  const targets: QueryInvalidationTarget[] = [];
  const workspaceId = event.workspace_id;

  if (isWorkspaceRecordEvent(event)) {
    targets.push(exact(workspaceKeys.byProject()));
    targets.push(exact(workspaceKeys.detail(workspaceId)));
  }

  if (event.kind === "workspace.status_changed" || event.kind === "workspace.deleted") {
    targets.push(exact(workspaceKeys.services(workspaceId)));
  }

  if (event.kind === "service.status_changed") {
    targets.push(exact(workspaceKeys.services(workspaceId)));
  }

  if (
    event.kind === "service.log_line" ||
    event.kind === "workspace.deleted" ||
    (event.kind === "workspace.status_changed" && event.status === "preparing")
  ) {
    targets.push(exact(workspaceKeys.serviceLogs(workspaceId)));
  }

  if (shouldRefreshWorkspaceActivity(event, workspaceId)) {
    targets.push(exact(workspaceKeys.activity(workspaceId)));
  }

  if (isTerminalEvent(event)) {
    targets.push(exact(terminalKeys.byWorkspace(workspaceId)));
  }

  if (event.kind === "git.status_changed" || event.kind === "git.head_changed") {
    targets.push(exact(gitKeys.status(workspaceId)));
  }

  if (event.kind === "git.head_changed" || event.kind === "git.log_changed") {
    targets.push(prefix(gitLogPrefix(workspaceId)));
  }

  if (event.kind === "git.head_changed") {
    targets.push(exact(gitKeys.pullRequests(workspaceId)));
    targets.push(exact(gitKeys.currentPullRequest(workspaceId)));
    targets.push(prefix(gitPullRequestPrefix(workspaceId)));
  }

  return targets;
}

export function invalidateQueriesForLifecycleEvent(
  client: QueryClient,
  event: LifecycleEvent,
): void {
  for (const target of getInvalidationTargetsForLifecycleEvent(event)) {
    if (target.kind === "exact") {
      client.invalidate(target.key);
      continue;
    }

    client.invalidatePrefix(target.prefix);
  }
}
