import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center border font-medium transition-colors rounded-full",
  {
    variants: {
      size: {
        default: "px-2 py-0.5 text-xs",
        sm: "px-1 py-0 text-[10px] leading-3.5",
      },
      variant: {
        default: "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]",
        secondary: "border-transparent bg-[var(--surface-selected)] text-[var(--foreground)]",
        outline: "border-[var(--border)] bg-transparent text-[var(--foreground)]",
        destructive:
          "border-[color-mix(in_srgb,var(--destructive)_35%,transparent)] bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] text-[var(--destructive)]",
        success:
          "text-[var(--status-success)] border-[color-mix(in_srgb,var(--status-success)_25%,transparent)] bg-[color-mix(in_srgb,var(--status-success)_10%,transparent)]",
        warning:
          "text-[var(--status-warning)] border-[color-mix(in_srgb,var(--status-warning)_25%,transparent)] bg-[color-mix(in_srgb,var(--status-warning)_10%,transparent)]",
        info: "text-[var(--status-info)] border-[color-mix(in_srgb,var(--status-info)_25%,transparent)] bg-[color-mix(in_srgb,var(--status-info)_10%,transparent)]",
        muted: "border-transparent bg-[var(--surface-selected)] text-[var(--muted-foreground)]",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "outline",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ className, variant }))} {...props} />;
}

export { Badge, badgeVariants };
