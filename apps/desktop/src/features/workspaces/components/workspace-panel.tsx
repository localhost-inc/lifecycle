import { useCallback, useEffect, useState } from "react";
import type { WorkspaceStatus } from "@lifecycle/contracts";
import type { ManifestStatus } from "../../projects/api/projects";
import { WorkspaceBadge } from "./workspace-badge";
import { ServiceIndicator } from "./service-indicator";
import { SetupProgress, type StepState } from "./setup-progress";
import type {
  WorkspaceRow,
  ServiceRow,
  WorkspaceStatusEvent,
  ServiceStatusEvent,
  SetupStepEvent,
} from "../api/workspaces";
import {
  startServices,
  stopWorkspace,
  getWorkspaceServices,
  subscribeToWorkspaceEvents,
} from "../api/workspaces";

interface WorkspacePanelProps {
  workspace: WorkspaceRow;
  manifestStatus: ManifestStatus | null;
}

export function WorkspacePanel({ workspace, manifestStatus }: WorkspacePanelProps) {
  const [status, setStatus] = useState<WorkspaceStatus>(workspace.status as WorkspaceStatus);
  const [failureReason, setFailureReason] = useState<string | null>(workspace.failure_reason);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [setupSteps, setSetupSteps] = useState<StepState[]>([]);

  const hasManifest = manifestStatus?.state === "valid";
  const config = hasManifest ? manifestStatus.result.config : null;

  useEffect(() => {
    setStatus(workspace.status as WorkspaceStatus);
    setFailureReason(workspace.failure_reason);
    setSetupSteps([]);
  }, [workspace.failure_reason, workspace.id, workspace.status]);

  // Load services on mount
  useEffect(() => {
    getWorkspaceServices(workspace.id).then(setServices).catch(console.error);
  }, [workspace.id]);

  // Subscribe to events
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    subscribeToWorkspaceEvents(workspace.id, {
      onWorkspaceStatus: (e: WorkspaceStatusEvent) => {
        setStatus(e.status);
        setFailureReason(e.failure_reason);
      },
      onServiceStatus: (e: ServiceStatusEvent) => {
        setServices((prev) => {
          const exists = prev.some((s) => s.service_name === e.service_name);
          if (exists) {
            return prev.map((s) =>
              s.service_name === e.service_name
                ? { ...s, status: e.status, status_reason: e.status_reason }
                : s,
            );
          }
          // New service appeared (inserted during start_services)
          return [
            ...prev,
            {
              id: "",
              workspace_id: workspace.id,
              service_name: e.service_name,
              exposure: "local",
              port_override: null,
              status: e.status,
              status_reason: e.status_reason,
              default_port: null,
              effective_port: null,
              preview_state: "disabled",
              preview_failure_reason: null,
              preview_url: null,
              created_at: "",
              updated_at: "",
            },
          ];
        });
      },
      onSetupProgress: (e: SetupStepEvent) => {
        setSetupSteps((prev) => {
          const exists = prev.some((s) => s.name === e.step_name);
          const updated = exists
            ? prev
            : [...prev, { name: e.step_name, status: "pending" as const, output: [] }];
          return updated.map((step) => {
            if (step.name !== e.step_name) return step;
            switch (e.event_type) {
              case "started":
                return { ...step, status: "running" as const };
              case "stdout":
              case "stderr":
                return {
                  ...step,
                  output: [...step.output, e.data ?? ""],
                };
              case "completed":
                return { ...step, status: "completed" as const };
              case "failed":
                return {
                  ...step,
                  status: "failed" as const,
                  output: [...step.output, e.data ?? ""],
                };
              case "timeout":
                return { ...step, status: "timeout" as const };
              default:
                return step;
            }
          });
        });
      },
    }).then((unsub) => {
      cleanup = unsub;
    });

    return () => cleanup?.();
  }, [workspace.id]);

  const handleRun = useCallback(async () => {
    if (!config) return;
    try {
      const manifestJson = JSON.stringify(config);
      setSetupSteps(
        config.setup.steps.map((s) => ({ name: s.name, status: "pending" as const, output: [] })),
      );
      await startServices(workspace.id, manifestJson);
    } catch (err) {
      console.error("Failed to start services:", err);
    }
  }, [workspace.id, config]);

  const handleStop = useCallback(async () => {
    try {
      await stopWorkspace(workspace.id);
    } catch (err) {
      console.error("Failed to stop workspace:", err);
    }
  }, [workspace.id]);

  const canRun = (status === "sleeping" || status === "failed") && hasManifest;
  const canStop = status === "ready" || status === "starting";
  const showSetup = setupSteps.length > 0 && (status === "starting" || status === "failed");
  const showServices =
    services.length > 0 && (status === "starting" || status === "ready" || status === "failed");

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
                Workspace
              </h2>
              <WorkspaceBadge status={status} />
            </div>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {workspace.source_ref}
              {workspace.git_sha && (
                <span className="ml-2 font-mono text-xs text-[var(--muted-foreground)]">
                  {workspace.git_sha.slice(0, 8)}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canRun && (
              <button
                type="button"
                onClick={handleRun}
                className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] hover:brightness-110"
              >
                Run
              </button>
            )}
            {canStop && (
              <button
                type="button"
                onClick={handleStop}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)]"
              >
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Sleeping state — prompt to run */}
        {status === "sleeping" && !hasManifest && (
          <div className="mt-8 rounded-md border border-[var(--border)] bg-[var(--card)] p-6 text-center">
            <p className="text-sm font-medium text-[var(--foreground)]">No lifecycle.json found</p>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              Add a <code className="font-mono">lifecycle.json</code> file to the project root to
              configure services and setup steps.
            </p>
          </div>
        )}

        {/* Setup progress */}
        {showSetup && (
          <div className="mt-8">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Setup
            </h3>
            <SetupProgress steps={setupSteps} />
          </div>
        )}

        {/* Services */}
        {showServices && (
          <div className="mt-8">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Services
            </h3>
            <div className="space-y-2">
              {services.map((svc) => (
                <ServiceIndicator key={svc.service_name} service={svc} />
              ))}
            </div>
          </div>
        )}

        {/* Failure detail */}
        {status === "failed" && failureReason && (
          <div className="mt-8">
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <h3 className="text-sm font-semibold text-red-800">Workspace failed</h3>
              <p className="mt-1 text-sm text-red-700">{failureReason}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
