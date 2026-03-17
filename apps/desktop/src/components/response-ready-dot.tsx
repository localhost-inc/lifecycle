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
        className="lifecycle-motion-ready-ring absolute h-3 w-3 rounded-full bg-[var(--accent)]/24"
      />
      <span
        aria-hidden="true"
        className="lifecycle-motion-soft-pulse relative h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_45%,transparent),0_0_10px_color-mix(in_srgb,var(--accent)_25%,transparent)]"
      />
    </span>
  );
}
