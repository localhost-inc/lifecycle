import type { LifecycleEvent } from "@lifecycle/contracts";
import type { QueryDescriptor, QueryUpdate } from "../../../query";
import {
  normalizeWorkspaceRuntimeProjection,
  type ServiceLogLine as ApiServiceLogLine,
  type ServiceLogSnapshot,
  type WorkspaceRuntimeProjectionResult,
  type WorkspaceStepProgressSnapshot,
} from "../api";
import {
  reduceWorkspaceActivityEvents,
  WORKSPACE_ACTIVITY_EVENT_KINDS,
} from "./workspace-activity";
import { workspaceKeys } from "./workspace-query-keys";

export type SetupStepState = WorkspaceStepProgressSnapshot;
export type EnvironmentTaskState = WorkspaceStepProgressSnapshot;
export type ServiceLogLine = ApiServiceLogLine;

export interface ServiceLogState {
  serviceName: string;
  lines: ServiceLogLine[];
}

type StepProgressEvent = Extract<
  LifecycleEvent,
  { kind: "workspace.setup_progress" | "environment.task_progress" }
>;

const SERVICE_LOG_LINE_LIMIT = 5000;

function emptyWorkspaceRuntimeProjection(): WorkspaceRuntimeProjectionResult {
  return {
    activity: [],
    environmentTasks: [],
    serviceLogs: [],
    setup: [],
  };
}

export function createWorkspaceRuntimeProjectionQuery(
  workspaceId: string,
): QueryDescriptor<WorkspaceRuntimeProjectionResult> {
  return {
    eventKinds: WORKSPACE_ACTIVITY_EVENT_KINDS,
    key: workspaceKeys.runtimeProjection(workspaceId),
    fetch(source) {
      return source
        .getWorkspaceRuntimeProjection(workspaceId)
        .then(normalizeWorkspaceRuntimeProjection);
    },
    reduce(current, event) {
      return reduceWorkspaceRuntimeProjection(current, event, workspaceId);
    },
  };
}

function reduceServiceLogsProjection(
  current: ServiceLogSnapshot[],
  event: LifecycleEvent,
  workspaceId: string,
): ServiceLogSnapshot[] {
  if (
    event.kind === "workspace.status_changed" &&
    event.workspace_id === workspaceId &&
    event.status === "starting"
  ) {
    return current.length > 0 ? [] : current;
  }

  if (event.kind !== "service.log_line" || event.workspace_id !== workspaceId) {
    return current;
  }

  const logLine: ApiServiceLogLine = { stream: event.stream, text: event.line };
  const existing = current.find((entry) => entry.service_name === event.service_name);
  if (existing) {
    return current.map((entry) => {
      if (entry.service_name !== event.service_name) {
        return entry;
      }

      const nextLines = [...entry.lines, logLine];
      if (nextLines.length > SERVICE_LOG_LINE_LIMIT) {
        nextLines.splice(0, nextLines.length - SERVICE_LOG_LINE_LIMIT);
      }
      return { ...entry, lines: nextLines };
    });
  }

  return [...current, { service_name: event.service_name, lines: [logLine] }];
}

export function reduceWorkspaceRuntimeProjection(
  current: WorkspaceRuntimeProjectionResult | undefined,
  event: LifecycleEvent,
  workspaceId: string,
): QueryUpdate<WorkspaceRuntimeProjectionResult> {
  if (event.workspace_id !== workspaceId) {
    return { kind: "none" };
  }

  const previous = current
    ? normalizeWorkspaceRuntimeProjection(current)
    : emptyWorkspaceRuntimeProjection();
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
  const nextServiceLogs = reduceServiceLogsProjection(previous.serviceLogs, event, workspaceId);
  const nextActivity = reduceWorkspaceActivityEvents(previous.activity, event, workspaceId);

  if (
    nextSetup === previous.setup &&
    nextEnvironmentTasks === previous.environmentTasks &&
    nextServiceLogs === previous.serviceLogs &&
    nextActivity === previous.activity
  ) {
    return { kind: "none" };
  }

  return {
    kind: "replace",
    data: {
      activity: nextActivity,
      environmentTasks: nextEnvironmentTasks,
      serviceLogs: nextServiceLogs,
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

  if (
    event.kind === "workspace.status_changed" &&
    event.workspace_id === workspaceId &&
    event.status === "idle" &&
    event.failure_reason !== null
  ) {
    return normalizeRunningStepProgressState(current, "failed");
  }

  if (event.kind !== progressKind || event.workspace_id !== workspaceId) {
    return current;
  }

  return reduceStepProgressState(current, event);
}

function normalizeRunningStepProgressState(
  current: WorkspaceStepProgressSnapshot[],
  status: WorkspaceStepProgressSnapshot["status"],
): WorkspaceStepProgressSnapshot[] {
  let changed = false;
  const next = current.map((step) => {
    if (step.status !== "running") {
      return step;
    }

    changed = true;
    return { ...step, status };
  });

  return changed ? next : current;
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
