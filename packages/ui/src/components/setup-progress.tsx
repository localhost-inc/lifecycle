import { useState } from "react";
import { cn } from "../lib/cn";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";
import { Separator } from "./separator";
import { StatusDot, type StatusDotTone } from "./status-dot";
import { Card } from "./card";

export type SetupProgressStepStatus = "pending" | "running" | "completed" | "failed" | "timeout";

export interface SetupProgressStep {
  name: string;
  output: string[];
  status: SetupProgressStepStatus;
}

interface SetupProgressProps {
  className?: string;
  steps: SetupProgressStep[];
}

const statusMap: Record<
  SetupProgressStepStatus,
  {
    glyph: string;
    pulse?: boolean;
    tone: StatusDotTone;
  }
> = {
  pending: { glyph: "\u25cb", tone: "neutral" },
  running: { glyph: "\u27f3", pulse: true, tone: "info" },
  completed: { glyph: "\u2713", tone: "success" },
  failed: { glyph: "\u2715", tone: "danger" },
  timeout: { glyph: "\u2715", tone: "danger" },
};

export function SetupProgress({ className, steps }: SetupProgressProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {steps.map((step) => (
        <SetupProgressStepRow key={step.name} step={step} />
      ))}
    </div>
  );
}

function SetupProgressStepRow({ step }: { step: SetupProgressStep }) {
  const [open, setOpen] = useState(false);
  const hasOutput = step.output.length > 0;
  const status = statusMap[step.status];

  return (
    <Collapsible onOpenChange={setOpen} open={hasOutput ? open : false}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <button
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
            disabled={!hasOutput}
            type="button"
          >
            <span className="flex items-center gap-2">
              <StatusDot pulse={status.pulse} size="sm" tone={status.tone} />
              <span
                className={cn(
                  "text-sm",
                  step.status === "completed" && "text-emerald-500",
                  step.status === "running" && "animate-spin text-blue-500",
                  (step.status === "failed" || step.status === "timeout") && "text-red-500",
                  step.status === "pending" && "text-[var(--muted-foreground)]",
                )}
              >
                {status.glyph}
              </span>
            </span>
            <span className="text-sm font-medium text-[var(--foreground)]">{step.name}</span>
            {hasOutput ? (
              <span className="ml-auto text-xs text-[var(--muted-foreground)]">
                {open ? "\u25bc" : "\u25b6"}
              </span>
            ) : null}
          </button>
        </CollapsibleTrigger>
        {hasOutput ? (
          <CollapsibleContent>
            <Separator />
            <div className="bg-[var(--muted)] px-4 py-3">
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs text-[var(--muted-foreground)]">
                {step.output.join("\n")}
              </pre>
            </div>
          </CollapsibleContent>
        ) : null}
      </Card>
    </Collapsible>
  );
}
