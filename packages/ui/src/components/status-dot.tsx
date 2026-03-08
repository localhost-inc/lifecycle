import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

export type StatusDotTone = "neutral" | "info" | "success" | "warning" | "danger";

const statusDotVariants = cva("inline-block shrink-0 rounded-full", {
  variants: {
    tone: {
      neutral: "bg-slate-500",
      info: "bg-blue-500",
      success: "bg-emerald-500",
      warning: "bg-amber-500",
      danger: "bg-red-500",
    },
    size: {
      sm: "h-1.5 w-1.5",
      default: "h-2 w-2",
    },
    pulse: {
      true: "animate-pulse",
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
