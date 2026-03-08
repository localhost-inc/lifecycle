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
        className="absolute h-3 w-3 rounded-full bg-amber-400/30 animate-ping"
      />
      <span
        aria-hidden="true"
        className="relative h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_0_1px_rgba(251,191,36,0.55),0_0_8px_rgba(251,191,36,0.35)]"
      />
    </span>
  );
}
