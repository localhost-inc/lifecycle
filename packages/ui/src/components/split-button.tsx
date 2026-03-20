import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const splitButtonPrimaryVariants = cva(
  "inline-flex items-center gap-2 font-semibold outline-none transition-[background-color,border-color,color,opacity] duration-150 ease-in-out focus-visible:shadow-[0_0_0_1px_var(--ring)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        foreground: "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--surface-selected)]",
        active: "bg-[var(--muted)] text-[var(--foreground)]",
        outline:
          "border border-r-0 border-[var(--border)] bg-transparent text-[var(--foreground)] hover:bg-[var(--surface-hover)]",
      },
      withIcon: {
        true: "",
        false: "",
      },
      size: {
        default: "h-8 rounded-l-xl text-xs",
        lg: "h-10 rounded-l-2xl text-sm",
      },
    },
    compoundVariants: [
      { size: "default", withIcon: true, className: "pl-2 pr-2.5" },
      { size: "default", withIcon: false, className: "px-3" },
      { size: "lg", withIcon: true, className: "pl-3 pr-3.5" },
      { size: "lg", withIcon: false, className: "px-4" },
    ],
    defaultVariants: {
      variant: "foreground",
      withIcon: false,
      size: "default",
    },
  },
);

const splitButtonSecondaryVariants = cva(
  "inline-flex items-center justify-center outline-none transition-[background-color,border-color,color,opacity] duration-150 ease-in-out hover:text-[var(--foreground)] focus-visible:shadow-[0_0_0_1px_var(--ring)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--surface-selected)]",
        outline:
          "border border-[var(--border)] bg-transparent text-[var(--foreground)] hover:bg-[var(--surface-hover)]",
      },
      size: {
        default: "h-8 w-8 rounded-r-xl",
        lg: "h-10 w-10 rounded-r-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const SplitButton = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  function SplitButton({ className, ...props }, ref) {
    return (
      <div className={cn("inline-flex items-center gap-px", className)} ref={ref} {...props} />
    );
  },
);

interface SplitButtonPrimaryProps
  extends
    React.ComponentPropsWithoutRef<"button">,
    VariantProps<typeof splitButtonPrimaryVariants> {
  leadingIcon?: React.ReactNode;
}

const SplitButtonPrimary = React.forwardRef<HTMLButtonElement, SplitButtonPrimaryProps>(
  function SplitButtonPrimary(
    { children, className, leadingIcon, size, type = "button", variant, ...props },
    ref,
  ) {
    return (
      <button
        className={cn(
          splitButtonPrimaryVariants({
            variant,
            size,
            withIcon: leadingIcon !== undefined && leadingIcon !== null,
          }),
          className,
        )}
        ref={ref}
        type={type}
        {...props}
      >
        {leadingIcon}
        <span>{children}</span>
      </button>
    );
  },
);

interface SplitButtonSecondaryProps
  extends
    React.ComponentPropsWithoutRef<"button">,
    VariantProps<typeof splitButtonSecondaryVariants> {}

const SplitButtonSecondary = React.forwardRef<HTMLButtonElement, SplitButtonSecondaryProps>(
  function SplitButtonSecondary(
    { children, className, size, type = "button", variant, ...props },
    ref,
  ) {
    return (
      <button
        className={cn(splitButtonSecondaryVariants({ size, variant }), className)}
        ref={ref}
        type={type}
        {...props}
      >
        {children}
      </button>
    );
  },
);

export {
  SplitButton,
  SplitButtonPrimary,
  SplitButtonSecondary,
  splitButtonPrimaryVariants,
  splitButtonSecondaryVariants,
};
