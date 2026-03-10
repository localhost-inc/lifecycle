import { cn } from "@lifecycle/ui";

interface ResponseReadyDotProps {
  className?: string;
}

export function ResponseReadyDot({ className }: ResponseReadyDotProps) {
  return (
    <span
      aria-label="Response ready"
      className={cn("relative inline-flex h-3 w-3 shrink-0 items-center justify-center", className)}
      role="img"
      title="Response ready"
    >
      <span
        aria-hidden="true"
        className="lifecycle-motion-ready-ring absolute h-3 w-3 rounded-full bg-amber-400/24"
      />
      <span
        aria-hidden="true"
        className="lifecycle-motion-soft-pulse relative h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.45),0_0_10px_rgba(251,191,36,0.25)]"
      />
    </span>
  );
}
