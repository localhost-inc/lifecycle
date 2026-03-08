import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center border px-2 py-0.5 text-xs font-medium transition-colors rounded-full",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]",
        secondary: "border-transparent bg-[var(--muted)] text-[var(--foreground)]",
        outline: "border-[var(--border)] bg-transparent text-[var(--foreground)]",
        destructive: "border-[var(--destructive)]/40 bg-transparent text-[var(--destructive)]",
        success:
          "text-[var(--status-added)] border-[color-mix(in_srgb,var(--status-added)_25%,transparent)] bg-[color-mix(in_srgb,var(--status-added)_8%,transparent)]",
        warning:
          "text-[var(--status-modified)] border-[color-mix(in_srgb,var(--status-modified)_25%,transparent)] bg-[color-mix(in_srgb,var(--status-modified)_8%,transparent)]",
        info: "text-[var(--status-renamed)] border-[color-mix(in_srgb,var(--status-renamed)_25%,transparent)] bg-[color-mix(in_srgb,var(--status-renamed)_8%,transparent)]",
        muted: "border-transparent bg-[var(--muted)] text-[var(--muted-foreground)]",
      },
    },
    defaultVariants: {
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
