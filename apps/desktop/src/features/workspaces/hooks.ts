import type {
  LifecycleEvent,
  LifecycleEventKind,
  ServiceRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import { useMemo } from "react";
import { reduceWorkspaceTerminals } from "../terminals/hooks";
import type { QueryDescriptor, QueryResult, QueryUpdate } from "../../query";
import { useQuery } from "../../query";
import type { ManifestStatus } from "../projects/api/projects";
import type {
  WorkspaceFileReadResult,
  WorkspaceFileTreeEntry,
  WorkspaceRuntimeProjectionResult,
  WorkspaceStepProgressSnapshot,
  WorkspaceSnapshotResult,
} from "./api";

export interface SetupStepState {
  name: string;
  output: string[];
  status: "pending" | "running" | "completed" | "failed" | "timeout";
}

export interface EnvironmentTaskState {
  name: string;
  output: string[];
  status: "pending" | "running" | "completed" | "failed" | "timeout";
}

export interface WorkspaceActivityItem {
  detail: string | null;
  id: string;
  kind: LifecycleEvent["kind"];
  occurredAt: string;
  title: string;
  tone: "neutral" | "danger" | "success" | "warning";
}

export const workspaceKeys = {
  activity: (workspaceId: string) => ["workspace-activity", workspaceId] as const,
  byProject: () => ["workspaces", "by-project"] as const,
  detail: (workspaceId: string) => ["workspace", workspaceId] as const,
  environmentTasks: (workspaceId: string) => ["workspace-environment-tasks", workspaceId] as const,
  file: (workspaceId: string, filePath: string) =>
    ["workspace-file", workspaceId, filePath] as const,
  fileTree: (workspaceId: string) => ["workspace-file-tree", workspaceId] as const,
  manifest: (workspaceId: string) => ["workspace-manifest", workspaceId] as const,
  runtimeProjection: (workspaceId: string) =>
    ["workspace-runtime-projection", workspaceId] as const,
  snapshot: (workspaceId: string) => ["workspace-snapshot", workspaceId] as const,
  services: (workspaceId: string) => ["workspace-services", workspaceId] as const,
  setup: (workspaceId: string) => ["workspace-setup", workspaceId] as const,
};

const WORKSPACE_ACTIVITY_LIMIT = 32;

const WORKSPACES_BY_PROJECT_EVENT_KINDS = [
  "git.head_changed",
  "workspace.manifest_synced",
  "workspace.renamed",
  "workspace.status_changed",
  "workspace.deleted",
] as const satisfies readonly LifecycleEventKind[];
const WORKSPACE_EVENT_KINDS = [
  "git.head_changed",
  "workspace.manifest_synced",
  "workspace.renamed",
  "workspace.status_changed",
  "workspace.deleted",
] as const satisfies readonly LifecycleEventKind[];
const WORKSPACE_SERVICE_EVENT_KINDS = [
  "service.configuration_changed",
  "service.status_changed",
  "workspace.manifest_synced",
  "workspace.status_changed",
  "workspace.deleted",
] as const satisfies readonly LifecycleEventKind[];
const WORKSPACE_SNAPSHOT_EVENT_KINDS = [
  "git.head_changed",
  "service.configuration_changed",
  "service.status_changed",
  "terminal.created",
  "terminal.status_changed",
  "terminal.renamed",
  "workspace.manifest_synced",
  "workspace.renamed",
  "workspace.status_changed",
  "workspace.deleted",
] as const satisfies readonly LifecycleEventKind[];
const WORKSPACE_ACTIVITY_EVENT_KINDS = [
  "workspace.status_changed",
  "workspace.renamed",
  "workspace.deleted",
  "workspace.manifest_synced",
  "service.configuration_changed",
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
          event.service.effective_port !== null ? `port ${event.service.effective_port}` : null,
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
  }
}

export function createWorkspacesByProjectQuery(): QueryDescriptor<
  Record<string, WorkspaceRecord[]>
> {
  return {
    eventKinds: WORKSPACES_BY_PROJECT_EVENT_KINDS,
    key: workspaceKeys.byProject(),
    fetch(source) {
      return source.listWorkspacesByProject();
    },
    reduce: reduceWorkspacesByProject,
  };
}

export function createWorkspaceQuery(workspaceId: string): QueryDescriptor<WorkspaceRecord | null> {
  return {
    eventKinds: WORKSPACE_EVENT_KINDS,
    key: workspaceKeys.detail(workspaceId),
    fetch(source) {
      return source.getWorkspace(workspaceId);
    },
    reduce(current, event) {
      return reduceWorkspaceRecord(current, event, workspaceId);
    },
  };
}

export function reduceWorkspacesByProject(
  current: Record<string, WorkspaceRecord[]> | undefined,
  event: LifecycleEvent,
): QueryUpdate<Record<string, WorkspaceRecord[]>> {
  if (event.kind === "workspace.manifest_synced" && current) {
    let changed = false;
    let found = false;
    const next = Object.fromEntries(
      Object.entries(current).map(([projectId, workspaces]) => [
        projectId,
        workspaces.map((workspace) => {
          if (workspace.id !== event.workspace_id) {
            return workspace;
          }

          found = true;
          if (workspace.manifest_fingerprint === event.manifest_fingerprint) {
            return workspace;
          }

          changed = true;
          return {
            ...workspace,
            manifest_fingerprint: event.manifest_fingerprint,
          };
        }),
      ]),
    );

    if (!found) {
      return { kind: "none" };
    }

    return changed ? { kind: "replace", data: next } : { kind: "none" };
  }

  if (event.kind === "workspace.renamed" && current) {
    let found = false;
    const next = Object.fromEntries(
      Object.entries(current).map(([projectId, workspaces]) => [
        projectId,
        workspaces.map((workspace) => {
          if (workspace.id !== event.workspace_id) {
            return workspace;
          }

          found = true;
          return {
            ...workspace,
            name: event.name,
            source_ref: event.source_ref,
            worktree_path: event.worktree_path,
          };
        }),
      ]),
    );

    return found ? { kind: "replace", data: next } : { kind: "invalidate" };
  }

  if (event.kind === "git.head_changed" && current) {
    let changed = false;
    let found = false;
    const next = Object.fromEntries(
      Object.entries(current).map(([projectId, workspaces]) => [
        projectId,
        workspaces.map((workspace) => {
          if (workspace.id !== event.workspace_id) {
            return workspace;
          }

          found = true;
          const nextSourceRef = event.branch ?? workspace.source_ref;
          const nextGitSha = event.head_sha;
          if (workspace.source_ref === nextSourceRef && workspace.git_sha === nextGitSha) {
            return workspace;
          }

          changed = true;
          return {
            ...workspace,
            source_ref: nextSourceRef,
            git_sha: nextGitSha,
          };
        }),
      ]),
    );

    if (!found) {
      return { kind: "none" };
    }

    return changed ? { kind: "replace", data: next } : { kind: "none" };
  }

  if (event.kind !== "workspace.status_changed" || !current) {
    if (event.kind !== "workspace.deleted" || !current) {
      return { kind: "none" };
    }

    let found = false;
    const next = Object.fromEntries(
      Object.entries(current).map(([projectId, workspaces]) => [
        projectId,
        workspaces.filter((workspace) => {
          const matches = workspace.id === event.workspace_id;
          if (matches) {
            found = true;
          }
          return !matches;
        }),
      ]),
    );

    return found ? { kind: "replace", data: next } : { kind: "none" };
  }

  let changed = false;
  let found = false;
  const next = Object.fromEntries(
    Object.entries(current).map(([projectId, workspaces]) => [
      projectId,
      workspaces.map((workspace) => {
        if (workspace.id !== event.workspace_id) {
          return workspace;
        }

        found = true;
        changed = true;
        return {
          ...workspace,
          failure_reason: event.failure_reason,
          status: event.status,
        };
      }),
    ]),
  );

  if (!found) {
    return { kind: "invalidate" };
  }

  return changed ? { kind: "replace", data: next } : { kind: "none" };
}

export function reduceWorkspaceRecord(
  current: WorkspaceRecord | null | undefined,
  event: LifecycleEvent,
  workspaceId: string,
): QueryUpdate<WorkspaceRecord | null> {
  if (event.kind === "workspace.manifest_synced" && event.workspace_id === workspaceId) {
    if (!current) {
      return { kind: "invalidate" };
    }

    if (current.manifest_fingerprint === event.manifest_fingerprint) {
      return { kind: "none" };
    }

    return {
      kind: "replace",
      data: {
        ...current,
        manifest_fingerprint: event.manifest_fingerprint,
      },
    };
  }

  if (event.kind === "git.head_changed" && event.workspace_id === workspaceId) {
    if (!current) {
      return { kind: "invalidate" };
    }

    const nextSourceRef = event.branch ?? current.source_ref;
    const nextGitSha = event.head_sha;
    if (current.source_ref === nextSourceRef && current.git_sha === nextGitSha) {
      return { kind: "none" };
    }

    return {
      kind: "replace",
      data: {
        ...current,
        source_ref: nextSourceRef,
        git_sha: nextGitSha,
      },
    };
  }

  if (event.kind !== "workspace.status_changed" || event.workspace_id !== workspaceId) {
    if (event.kind === "workspace.renamed" && event.workspace_id === workspaceId) {
      if (!current) {
        return { kind: "invalidate" };
      }

      return {
        kind: "replace",
        data: {
          ...current,
          name: event.name,
          source_ref: event.source_ref,
          worktree_path: event.worktree_path,
        },
      };
    }

    if (event.kind === "workspace.deleted" && event.workspace_id === workspaceId) {
      return {
        kind: "replace",
        data: null,
      };
    }

    return { kind: "none" };
  }

  if (!current) {
    return { kind: "invalidate" };
  }

  return {
    kind: "replace",
    data: {
      ...current,
      failure_reason: event.failure_reason,
      status: event.status,
    },
  };
}

export function createWorkspaceSnapshotQuery(
  workspaceId: string,
): QueryDescriptor<WorkspaceSnapshotResult> {
  return {
    eventKinds: WORKSPACE_SNAPSHOT_EVENT_KINDS,
    key: workspaceKeys.snapshot(workspaceId),
    fetch(source) {
      return source.getWorkspaceSnapshot(workspaceId);
    },
    reduce(current, event) {
      return reduceWorkspaceSnapshot(current, event, workspaceId);
    },
  };
}

export function createWorkspaceManifestQuery(
  workspaceId: string,
  worktreePath: string,
): QueryDescriptor<ManifestStatus> {
  return {
    key: workspaceKeys.manifest(workspaceId),
    fetch(source) {
      return source.readManifest(worktreePath);
    },
  };
}

export function reduceWorkspaceSnapshot(
  current: WorkspaceSnapshotResult | undefined,
  event: LifecycleEvent,
  workspaceId: string,
): QueryUpdate<WorkspaceSnapshotResult> {
  if (!current) {
    if (event.kind === "workspace.deleted" && event.workspace_id === workspaceId) {
      return {
        kind: "replace",
        data: {
          services: [],
          terminals: [],
          workspace: null,
        },
      };
    }

    return { kind: "invalidate" };
  }

  const workspaceUpdate = reduceWorkspaceRecord(current.workspace, event, workspaceId);
  const servicesUpdate = reduceWorkspaceServices(current.services, event, workspaceId);
  const terminalsUpdate = reduceWorkspaceTerminals(current.terminals, event, workspaceId);

  if (
    workspaceUpdate.kind === "invalidate" ||
    servicesUpdate.kind === "invalidate" ||
    terminalsUpdate.kind === "invalidate"
  ) {
    return { kind: "invalidate" };
  }

  if (
    workspaceUpdate.kind === "none" &&
    servicesUpdate.kind === "none" &&
    terminalsUpdate.kind === "none"
  ) {
    return { kind: "none" };
  }

  return {
    kind: "replace",
    data: {
      services: servicesUpdate.kind === "replace" ? servicesUpdate.data : current.services,
      terminals: terminalsUpdate.kind === "replace" ? terminalsUpdate.data : current.terminals,
      workspace: workspaceUpdate.kind === "replace" ? workspaceUpdate.data : current.workspace,
    },
  };
}

export function createWorkspaceServicesQuery(
  workspaceId: string,
): QueryDescriptor<ServiceRecord[]> {
  return {
    eventKinds: WORKSPACE_SERVICE_EVENT_KINDS,
    key: workspaceKeys.services(workspaceId),
    fetch(source) {
      return source.getWorkspaceServices(workspaceId);
    },
    reduce(current, event) {
      return reduceWorkspaceServices(current, event, workspaceId);
    },
  };
}

export function reduceWorkspaceServices(
  current: ServiceRecord[] | undefined,
  event: LifecycleEvent,
  workspaceId: string,
): QueryUpdate<ServiceRecord[]> {
  if (event.kind === "workspace.manifest_synced" && event.workspace_id === workspaceId) {
    return { kind: "replace", data: event.services };
  }

  if (
    (event.kind === "workspace.status_changed" || event.kind === "workspace.deleted") &&
    event.workspace_id === workspaceId
  ) {
    return { kind: "invalidate" };
  }

  if (event.kind !== "service.status_changed" && event.kind !== "service.configuration_changed") {
    return { kind: "none" };
  }

  if (event.workspace_id !== workspaceId) {
    return { kind: "none" };
  }

  if (!current) {
    return { kind: "invalidate" };
  }

  const serviceName =
    event.kind === "service.status_changed" ? event.service_name : event.service.service_name;
  let found = false;
  const next = current.map((service) => {
    if (service.service_name !== serviceName) {
      return service;
    }

    found = true;
    if (event.kind === "service.status_changed") {
      return {
        ...service,
        status: event.status,
        status_reason: event.status_reason,
      };
    }

    return event.service;
  });

  if (!found) {
    return { kind: "invalidate" };
  }

  return { kind: "replace", data: next };
}

function createWorkspaceFileQuery(
  workspaceId: string,
  filePath: string,
): QueryDescriptor<WorkspaceFileReadResult> {
  return {
    key: workspaceKeys.file(workspaceId, filePath),
    fetch(source) {
      return source.getWorkspaceFile(workspaceId, filePath);
    },
  };
}

function createWorkspaceFileTreeQuery(
  workspaceId: string,
): QueryDescriptor<WorkspaceFileTreeEntry[]> {
  return {
    key: workspaceKeys.fileTree(workspaceId),
    fetch(source) {
      return source.listWorkspaceFiles(workspaceId);
    },
  };
}

function emptyWorkspaceRuntimeProjection(): WorkspaceRuntimeProjectionResult {
  return {
    activity: [],
    environmentTasks: [],
    setup: [],
  };
}

function createWorkspaceRuntimeProjectionQuery(
  workspaceId: string,
): QueryDescriptor<WorkspaceRuntimeProjectionResult> {
  return {
    eventKinds: WORKSPACE_ACTIVITY_EVENT_KINDS,
    key: workspaceKeys.runtimeProjection(workspaceId),
    fetch(source) {
      return source.getWorkspaceRuntimeProjection(workspaceId);
    },
    reduce(current, event) {
      return reduceWorkspaceRuntimeProjection(current, event, workspaceId);
    },
  };
}

type StepProgressEvent = Extract<
  LifecycleEvent,
  { kind: "workspace.setup_progress" | "environment.task_progress" }
>;

export function reduceWorkspaceRuntimeProjection(
  current: WorkspaceRuntimeProjectionResult | undefined,
  event: LifecycleEvent,
  workspaceId: string,
): QueryUpdate<WorkspaceRuntimeProjectionResult> {
  if (event.workspace_id !== workspaceId) {
    return { kind: "none" };
  }

  const previous = current ?? emptyWorkspaceRuntimeProjection();
  const nextSetup = reduceWorkspaceStepProgressProjection(
    previous.setup,
    event,
    workspaceId,
    "workspace.setup_progress",
  );
  const nextEnvironmentTasks = reduceWorkspaceStepProgressProjection(
    previous.environmentTasks,
    event,
    workspaceId,
    "environment.task_progress",
  );
  const nextActivity = reduceWorkspaceActivityEvents(previous.activity, event, workspaceId);

  if (
    nextSetup === previous.setup &&
    nextEnvironmentTasks === previous.environmentTasks &&
    nextActivity === previous.activity
  ) {
    return { kind: "none" };
  }

  return {
    kind: "replace",
    data: {
      activity: nextActivity,
      environmentTasks: nextEnvironmentTasks,
      setup: nextSetup,
    },
  };
}

function reduceWorkspaceStepProgressProjection(
  current: WorkspaceStepProgressSnapshot[],
  event: LifecycleEvent,
  workspaceId: string,
  progressKind: StepProgressEvent["kind"],
): WorkspaceStepProgressSnapshot[] {
  if (event.kind === "workspace.deleted" && event.workspace_id === workspaceId) {
    return current.length > 0 ? [] : current;
  }

  if (
    event.kind === "workspace.status_changed" &&
    event.workspace_id === workspaceId &&
    event.status === "starting"
  ) {
    return current.length > 0 ? [] : current;
  }

  if (event.kind !== progressKind || event.workspace_id !== workspaceId) {
    return current;
  }

  return reduceStepProgressState(current, event);
}

function reduceStepProgressState(
  current: WorkspaceStepProgressSnapshot[] | undefined,
  event: StepProgressEvent,
): WorkspaceStepProgressSnapshot[] {
  const previous = current ?? [];
  const existing = previous.find((step) => step.name === event.step_name);
  const steps = existing
    ? previous
    : [...previous, { name: event.step_name, output: [], status: "pending" as const }];

  return steps.map((step) => {
    if (step.name !== event.step_name) {
      return step;
    }

    switch (event.event_kind) {
      case "started":
        return { ...step, status: "running" as const };
      case "stdout":
      case "stderr":
        return { ...step, output: [...step.output, event.data ?? ""] };
      case "completed":
        return { ...step, status: "completed" as const };
      case "failed":
        return {
          ...step,
          output: [...step.output, event.data ?? ""],
          status: "failed" as const,
        };
      case "timeout":
        return { ...step, status: "timeout" as const };
    }
  });
}

function eventContributesToWorkspaceActivity(event: LifecycleEvent): boolean {
  return !(
    (event.kind === "workspace.setup_progress" || event.kind === "environment.task_progress") &&
    (event.event_kind === "stdout" || event.event_kind === "stderr")
  );
}

function reduceWorkspaceActivityEvents(
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
) {
  if (event.workspace_id !== workspaceId) {
    return { kind: "none" as const };
  }

  const activity = summarizeWorkspaceActivity(event);
  if (!activity) {
    return { kind: "none" as const };
  }

  return {
    kind: "replace" as const,
    data: [activity, ...(current ?? []).filter((item) => item.id !== activity.id)].slice(
      0,
      WORKSPACE_ACTIVITY_LIMIT,
    ),
  };
}

export function useWorkspacesByProject() {
  return useQuery(createWorkspacesByProjectQuery(), {
    disabledData: undefined,
  });
}

export function useProjectWorkspaces(
  projectId: string | null,
): QueryResult<WorkspaceRecord[] | undefined> {
  const query = useWorkspacesByProject();

  return useMemo(
    () => ({
      ...query,
      data: projectId && query.data ? (query.data[projectId] ?? []) : undefined,
    }),
    [projectId, query],
  );
}

export function useWorkspace(workspaceId: string | null): QueryResult<WorkspaceRecord | null> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceQuery(workspaceId) : null),
    [workspaceId],
  );

  return useQuery(descriptor, {
    disabledData: null,
  });
}

export function useWorkspaceSnapshot(
  workspaceId: string | null,
): QueryResult<WorkspaceSnapshotResult | null> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceSnapshotQuery(workspaceId) : null),
    [workspaceId],
  );

  return useQuery(descriptor, {
    disabledData: null,
  });
}

export function useWorkspaceManifest(
  workspaceId: string | null,
  worktreePath: string | null,
): QueryResult<ManifestStatus | null> {
  const descriptor = useMemo(
    () =>
      workspaceId && worktreePath ? createWorkspaceManifestQuery(workspaceId, worktreePath) : null,
    [workspaceId, worktreePath],
  );

  return useQuery(descriptor, {
    disabledData: null,
  });
}

export function useWorkspaceServices(
  workspaceId: string | null,
): QueryResult<ServiceRecord[] | undefined> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceServicesQuery(workspaceId) : null),
    [workspaceId],
  );

  return useQuery(descriptor, {
    disabledData: undefined,
  });
}

export function useWorkspaceFile(
  workspaceId: string | null,
  filePath: string | null,
): QueryResult<WorkspaceFileReadResult | null> {
  const descriptor = useMemo(
    () => (workspaceId && filePath ? createWorkspaceFileQuery(workspaceId, filePath) : null),
    [filePath, workspaceId],
  );

  return useQuery(descriptor, {
    disabledData: null,
  });
}

export function useWorkspaceFileTree(
  workspaceId: string | null,
): QueryResult<WorkspaceFileTreeEntry[] | undefined> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceFileTreeQuery(workspaceId) : null),
    [workspaceId],
  );

  return useQuery(descriptor, {
    disabledData: undefined,
  });
}

function useWorkspaceRuntimeProjection(
  workspaceId: string | null,
): QueryResult<WorkspaceRuntimeProjectionResult | undefined> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceRuntimeProjectionQuery(workspaceId) : null),
    [workspaceId],
  );

  return useQuery(descriptor, {
    disabledData: undefined,
  });
}

export function useWorkspaceSetup(
  workspaceId: string | null,
): QueryResult<SetupStepState[] | undefined> {
  const query = useWorkspaceRuntimeProjection(workspaceId);

  return useMemo(
    () => ({
      ...query,
      data: query.data?.setup,
    }),
    [query],
  );
}

export function useWorkspaceEnvironmentTasks(
  workspaceId: string | null,
): QueryResult<EnvironmentTaskState[] | undefined> {
  const query = useWorkspaceRuntimeProjection(workspaceId);

  return useMemo(
    () => ({
      ...query,
      data: query.data?.environmentTasks,
    }),
    [query],
  );
}

export function useWorkspaceActivity(
  workspaceId: string | null,
): QueryResult<WorkspaceActivityItem[] | undefined> {
  const query = useWorkspaceRuntimeProjection(workspaceId);

  return useMemo(
    () => ({
      ...query,
      data: query.data ? buildWorkspaceActivityItems(query.data.activity) : undefined,
    }),
    [query],
  );
}
