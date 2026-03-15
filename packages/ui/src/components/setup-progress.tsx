import { useState } from "react";
import { cn } from "../lib/cn";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";

export type SetupProgressStepStatus = "pending" | "running" | "completed" | "failed" | "timeout";

export interface SetupProgressStep {
  name: string;
  output: string[];
  status: SetupProgressStepStatus;
}

interface SetupProgressProps {
  className?: string;
  expandOutputByDefault?: boolean;
  steps: SetupProgressStep[];
}

const dotClassName: Record<SetupProgressStepStatus, string> = {
  pending: "bg-[var(--muted-foreground)]/40",
  running: "bg-[var(--status-info)] lifecycle-motion-soft-pulse",
  completed: "bg-[var(--status-success)]",
  failed: "bg-[var(--status-danger)]",
  timeout: "bg-[var(--status-danger)]",
};

const nameClassName: Record<SetupProgressStepStatus, string> = {
  pending: "text-[var(--muted-foreground)]",
  running: "text-[var(--foreground)]",
  completed: "text-[var(--foreground)]",
  failed: "text-[var(--foreground)]",
  timeout: "text-[var(--foreground)]",
};

export function SetupProgress({
  className,
  expandOutputByDefault = false,
  steps,
}: SetupProgressProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {steps.map((step) => (
        <SetupProgressStepRow
          expandOutputByDefault={expandOutputByDefault}
          key={step.name}
          step={step}
        />
      ))}
    </div>
  );
}

function SetupProgressStepRow({
  expandOutputByDefault,
  step,
}: {
  expandOutputByDefault: boolean;
  step: SetupProgressStep;
}) {
  const [open, setOpen] = useState(expandOutputByDefault);
  const hasOutput = step.output.length > 0;

  return (
    <Collapsible onOpenChange={setOpen} open={hasOutput ? open : false}>
      <div className="group/row">
        <CollapsibleTrigger asChild>
          <button
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
            disabled={!hasOutput}
            type="button"
          >
            <div className="flex size-3.5 shrink-0 items-center justify-center">
              <span
                className={`inline-block size-[7px] rounded-full ${dotClassName[step.status]}`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <span className={`truncate text-[13px] font-medium ${nameClassName[step.status]}`}>
                {step.name}
              </span>
            </div>
            {hasOutput ? (
              <span className="text-xs text-[var(--muted-foreground)]">
                {open ? "\u25bc" : "\u25b6"}
              </span>
            ) : null}
          </button>
        </CollapsibleTrigger>
        {hasOutput ? (
          <CollapsibleContent>
            <div className="rounded-lg bg-[var(--muted)] px-3 py-2.5 ml-[38px] mb-1">
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs text-[var(--muted-foreground)]">
                {step.output.join("\n")}
              </pre>
            </div>
          </CollapsibleContent>
        ) : null}
      </div>
    </Collapsible>
  );
}
