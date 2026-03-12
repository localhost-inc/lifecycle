import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

export type StatusDotTone = "neutral" | "info" | "success" | "warning" | "danger";

const statusDotVariants = cva("inline-block shrink-0 rounded-full", {
  variants: {
    tone: {
      neutral: "bg-[var(--status-neutral)]",
      info: "bg-[var(--status-info)]",
      success: "bg-[var(--status-success)]",
      warning: "bg-[var(--status-warning)]",
      danger: "bg-[var(--status-danger)]",
    },
    size: {
      sm: "h-1.5 w-1.5",
      default: "h-2 w-2",
    },
    pulse: {
      true: "lifecycle-motion-soft-pulse",
      false: "",
    },
  },
  defaultVariants: {
    tone: "neutral",
    size: "default",
    pulse: false,
  },
});

function StatusDot({
  className,
  pulse,
  size,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof statusDotVariants>) {
  return <span className={cn(statusDotVariants({ className, pulse, size, tone }))} {...props} />;
}

export { StatusDot, statusDotVariants };
