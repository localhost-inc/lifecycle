import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Button, type ButtonProps } from "./button";
import { cn } from "../lib/cn";

const alertVariants = cva(
  "relative grid w-full grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1.5 border px-4 py-3 text-sm rounded-lg [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4 [&>svg]:text-current [&>svg~[data-slot=alert-title]]:pl-7 [&>svg~[data-slot=alert-description]]:pl-7",
  {
    variants: {
      variant: {
        default: "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]",
        destructive:
          "border-[var(--destructive)]/40 bg-transparent text-[var(--destructive)] [&>svg]:text-[var(--destructive)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      className={cn(alertVariants({ className, variant }))}
      data-slot="alert"
      role="alert"
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
  return (
    <h5
      className={cn("col-start-1 font-medium leading-none tracking-tight", className)}
      data-slot="alert-title"
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("col-start-1 text-sm opacity-90 [&_p]:leading-relaxed", className)}
      data-slot="alert-description"
      {...props}
    />
  );
}

function AlertAction({ className, size = "sm", variant = "outline", ...props }: ButtonProps) {
  return (
    <Button
      className={cn("col-start-2 row-span-2 row-start-1 justify-self-end", className)}
      data-slot="alert-action"
      size={size}
      variant={variant}
      {...props}
    />
  );
}

export { Alert, AlertAction, AlertTitle, AlertDescription };
