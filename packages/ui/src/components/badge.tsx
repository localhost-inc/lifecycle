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
          "border-[var(--destructive)]/35 bg-[var(--destructive)]/10 text-[var(--destructive)]",
        success:
          "text-[var(--status-success)] border-[var(--status-success)]/25 bg-[var(--status-success)]/10",
        warning:
          "text-[var(--status-warning)] border-[var(--status-warning)]/25 bg-[var(--status-warning)]/10",
        info: "text-[var(--status-info)] border-[var(--status-info)]/25 bg-[var(--status-info)]/10",
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
