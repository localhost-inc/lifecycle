import type { WorkspaceRecord } from "@lifecycle/contracts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  SetupProgress,
} from "@lifecycle/ui";
import { AlertTriangle, CheckCircle2, LoaderCircle, Wrench } from "lucide-react";
import type { SetupStepState } from "../hooks";

export type SetupPresentationPhase = "completed" | "failed" | "running";

export interface SetupPresentation {
  completedSteps: number;
  currentStepIndex: number;
  currentStepName: string;
  description: string;
  phase: SetupPresentationPhase;
  title: string;
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
      description: "Setup stopped before the workspace environment could finish booting.",
      phase: "failed",
      title: `${failedStep.name} failed`,
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
      description: `${completedSteps} of ${totalSteps} setup steps complete.`,
      phase: "running",
      title:
        activeStep.status === "running"
          ? `${activeStep.name} in progress`
          : `Up next: ${activeStep.name}`,
      totalSteps,
    };
  }

  if (allCompleted) {
    const lastStep = setupSteps[totalSteps - 1]!;

    return {
      completedSteps,
      currentStepIndex: totalSteps - 1,
      currentStepName: lastStep.name,
      description:
        "Environment prerequisites finished and the workspace is ready to continue booting.",
      phase: "completed",
      title: "Setup complete",
      totalSteps,
    };
  }

  return null;
}

interface SetupTabProps {
  setupSteps: SetupStepState[];
  workspace: Pick<WorkspaceRecord, "failure_reason" | "status">;
}

const PHASE_META = {
  completed: {
    accent:
      "border-emerald-500/30 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(16,185,129,0.03))]",
    icon: CheckCircle2,
    iconClassName: "text-emerald-500",
    label: "Completed",
  },
  failed: {
    accent:
      "border-red-500/30 bg-[linear-gradient(135deg,rgba(239,68,68,0.12),rgba(239,68,68,0.03))]",
    icon: AlertTriangle,
    iconClassName: "text-red-500",
    label: "Failed",
  },
  running: {
    accent:
      "border-blue-500/30 bg-[linear-gradient(135deg,rgba(59,130,246,0.12),rgba(59,130,246,0.03))]",
    icon: LoaderCircle,
    iconClassName: "animate-spin text-blue-500",
    label: "Running",
  },
} as const;

export function SetupTab({ setupSteps, workspace }: SetupTabProps) {
  const presentation = deriveSetupPresentation(setupSteps, workspace);

  if (!presentation) {
    return (
      <EmptyState
        description="Setup steps and command output will appear here the next time this workspace needs environment preparation."
        icon={<Wrench />}
        size="sm"
        title="No setup activity yet"
      />
    );
  }

  const phaseMeta = PHASE_META[presentation.phase];
  const Icon = phaseMeta.icon;

  return (
    <div className="flex flex-col gap-3">
      <Card className={`overflow-hidden ${phaseMeta.accent}`}>
        <CardHeader className="gap-2 pb-4">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            <Icon className={`size-3.5 ${phaseMeta.iconClassName}`} strokeWidth={2.2} />
            <span>{phaseMeta.label}</span>
          </div>
          <div className="space-y-1">
            <CardTitle className="text-sm">{presentation.title}</CardTitle>
            <CardDescription className="text-xs">{presentation.description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-center justify-between rounded-lg border border-[var(--border)]/70 bg-[var(--background)]/70 px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Current step
            </span>
            <span className="font-mono text-xs text-[var(--foreground)]">
              {presentation.currentStepName}
            </span>
          </div>
          <div className="flex gap-2">
            <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-[var(--border)]/70 bg-[var(--background)]/70 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                Progress
              </span>
              <span className="font-mono text-xs text-[var(--foreground)]">
                Step {presentation.currentStepIndex + 1} of {presentation.totalSteps}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-[var(--border)]/70 bg-[var(--background)]/70 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                Completed
              </span>
              <span className="font-mono text-xs text-[var(--foreground)]">
                {presentation.completedSteps}/{presentation.totalSteps}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
      <SetupProgress expandOutputByDefault steps={setupSteps} />
    </div>
  );
}
