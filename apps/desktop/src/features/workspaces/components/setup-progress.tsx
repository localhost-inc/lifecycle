import { useState } from "react";

interface StepState {
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "timeout";
  output: string[];
}

interface SetupProgressProps {
  steps: StepState[];
}

export function SetupProgress({ steps }: SetupProgressProps) {
  return (
    <div className="space-y-2">
      {steps.map((step) => (
        <SetupStepRow key={step.name} step={step} />
      ))}
    </div>
  );
}

function SetupStepRow({ step }: { step: StepState }) {
  const [expanded, setExpanded] = useState(false);

  const icon =
    step.status === "completed"
      ? "✓"
      : step.status === "running"
        ? "⟳"
        : step.status === "failed" || step.status === "timeout"
          ? "✕"
          : "○";

  const iconColor =
    step.status === "completed"
      ? "text-emerald-500"
      : step.status === "running"
        ? "text-blue-500 animate-spin"
        : step.status === "failed" || step.status === "timeout"
          ? "text-red-500"
          : "text-[var(--muted-foreground)]";

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)]">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`text-sm ${iconColor}`}>{icon}</span>
        <span className="text-sm font-medium text-[var(--foreground)]">{step.name}</span>
        {step.output.length > 0 && (
          <span className="ml-auto text-xs text-[var(--muted-foreground)]">
            {expanded ? "▼" : "▶"}
          </span>
        )}
      </button>
      {expanded && step.output.length > 0 && (
        <div className="border-t border-[var(--border)] bg-[var(--muted)] px-4 py-3">
          <pre className="max-h-48 overflow-auto font-mono text-xs text-[var(--muted-foreground)]">
            {step.output.join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
}

export type { StepState };
