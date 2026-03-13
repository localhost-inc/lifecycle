import type { LifecycleConfig, ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { SetupProgress } from "@lifecycle/ui";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { EnvironmentSection } from "./environment-section";
import { ServiceRow } from "./services-tab";
import type { EnvironmentTaskState, SetupStepState } from "../hooks";

export type SetupPresentationPhase = "completed" | "failed" | "running";

export interface SetupPresentation {
  completedSteps: number;
  currentStepIndex: number;
  currentStepName: string;
  phase: SetupPresentationPhase;
  totalSteps: number;
}

export function deriveSetupPresentation(
  setupSteps: SetupStepState[],
  workspace: Pick<WorkspaceRecord, "failure_reason" | "status">,
): SetupPresentation | null {
  if (setupSteps.length === 0) {
    return null;
  }

  const failedIndex = setupSteps.findIndex(
    (step) => step.status === "failed" || step.status === "timeout",
  );
  const runningIndex = setupSteps.findIndex((step) => step.status === "running");
  const pendingIndex = setupSteps.findIndex((step) => step.status === "pending");
  const completedSteps = setupSteps.filter((step) => step.status === "completed").length;
  const totalSteps = setupSteps.length;
  const allCompleted = completedSteps === totalSteps;

  if (
    workspace.status === "idle" &&
    (workspace.failure_reason === "setup_step_failed" || failedIndex >= 0)
  ) {
    const failedStep = setupSteps[failedIndex >= 0 ? failedIndex : 0]!;

    return {
      completedSteps,
      currentStepIndex: failedIndex >= 0 ? failedIndex : 0,
      currentStepName: failedStep.name,
      phase: "failed",
      totalSteps,
    };
  }

  if (workspace.status === "starting" || runningIndex >= 0 || pendingIndex >= 0) {
    const activeIndex = runningIndex >= 0 ? runningIndex : pendingIndex >= 0 ? pendingIndex : 0;
    const activeStep = setupSteps[activeIndex]!;

    return {
      completedSteps,
      currentStepIndex: activeIndex,
      currentStepName: activeStep.name,
      phase: "running",
      totalSteps,
    };
  }

  if (allCompleted) {
    const lastStep = setupSteps[totalSteps - 1]!;

    return {
      completedSteps,
      currentStepIndex: totalSteps - 1,
      currentStepName: lastStep.name,
      phase: "completed",
      totalSteps,
    };
  }

  return null;
}

interface OverviewTabProps {
  config: LifecycleConfig | null;
  declaredStepNames: string[];
  environmentTasks: EnvironmentTaskState[];
  onUpdateService: (input: {
    exposure: ServiceRecord["exposure"];
    portOverride: number | null;
    serviceName: string;
  }) => Promise<void>;
  serviceRuntimeByName: Partial<Record<string, "image" | "process">>;
  services: ServiceRecord[];
  setupSteps: SetupStepState[];
  workspace: Pick<WorkspaceRecord, "failure_reason" | "status">;
}

const STATUS_BANNER = {
  completed: {
    icon: CheckCircle2,
    iconClassName: "text-emerald-500",
    label: "Setup complete",
  },
  failed: {
    icon: AlertTriangle,
    iconClassName: "text-red-500",
    label: "Setup failed",
  },
} as const;

export function OverviewTab({
  config,
  declaredStepNames,
  environmentTasks,
  onUpdateService,
  serviceRuntimeByName,
  services,
  setupSteps,
  workspace,
}: OverviewTabProps) {
  const presentation = deriveSetupPresentation(setupSteps, workspace);

  const runtimeOrder: Record<string, number> = { image: 0, process: 1 };
  const sortedServices = [...services].sort((a, b) => {
    const aOrder = runtimeOrder[serviceRuntimeByName[a.service_name] ?? ""] ?? 2;
    const bOrder = runtimeOrder[serviceRuntimeByName[b.service_name] ?? ""] ?? 2;
    return aOrder - bOrder || a.service_name.localeCompare(b.service_name);
  });

  const declaredTaskNames = Object.entries(config?.environment ?? {})
    .filter(([, node]) => node.kind === "task")
    .map(([name]) => name);

  const setupStepsToShow =
    setupSteps.length > 0
      ? setupSteps
      : declaredStepNames.map((name) => ({ name, output: [], status: "pending" as const }));

  const tasksToShow =
    environmentTasks.length > 0
      ? environmentTasks
      : declaredTaskNames.map((name) => ({ name, output: [], status: "pending" as const }));

  const banner =
    presentation?.phase === "completed" || presentation?.phase === "failed"
      ? STATUS_BANNER[presentation.phase]
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <EnvironmentSection title="Setup">
        {banner && (
          <div className="flex items-center gap-2 px-1 text-xs text-[var(--muted-foreground)]">
            <banner.icon className={`size-3.5 ${banner.iconClassName}`} strokeWidth={2.2} />
            <span>{banner.label}</span>
          </div>
        )}
        <SetupProgress
          expandOutputByDefault={presentation?.phase === "running"}
          steps={setupStepsToShow}
        />
      </EnvironmentSection>
      <EnvironmentSection title="Tasks">
        <SetupProgress expandOutputByDefault steps={tasksToShow} />
      </EnvironmentSection>
      <EnvironmentSection title="Services">
        <div className="flex flex-col gap-1">
          {sortedServices.map((service) => (
            <ServiceRow
              key={`${service.id}:${service.updated_at}`}
              onUpdateService={onUpdateService}
              runtime={serviceRuntimeByName[service.service_name] ?? null}
              service={service}
            />
          ))}
        </div>
      </EnvironmentSection>
    </div>
  );
}
