import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const splitButtonPrimaryVariants = cva(
  "inline-flex h-8 items-center gap-2 rounded-l-xl bg-[var(--muted)] text-xs font-semibold outline-none transition-[background-color,border-color,color,opacity] duration-150 ease-in-out focus-visible:shadow-[0_0_0_1px_var(--ring)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        foreground:
          "text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--muted),var(--foreground)_8%)]",
        active: "text-[var(--foreground)]",
      },
    withIcon: {
      true: "pl-2 pr-2.5",
      false: "px-3",
    },
  },
  defaultVariants: {
    variant: "foreground",
    withIcon: false,
  },
});

const splitButtonSecondaryVariants = cva(
  "inline-flex h-8 w-8 items-center justify-center rounded-r-xl bg-[var(--muted)] text-[var(--muted-foreground)] outline-none transition-[background-color,border-color,color,opacity] duration-150 ease-in-out hover:bg-[color-mix(in_srgb,var(--muted),var(--foreground)_8%)] hover:text-[var(--foreground)] focus-visible:shadow-[0_0_0_1px_var(--ring)] disabled:pointer-events-none disabled:opacity-50",
);

const SplitButton = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  function SplitButton({ className, ...props }, ref) {
    return (
      <div
        className={cn("inline-flex items-center gap-px", className)}
        ref={ref}
        {...props}
      />
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
    { children, className, leadingIcon, type = "button", variant, ...props },
    ref,
  ) {
    return (
      <button
        className={cn(
          splitButtonPrimaryVariants({
            variant,
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

const SplitButtonSecondary = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button">
>(function SplitButtonSecondary({ children, className, type = "button", ...props }, ref) {
  return (
    <button
      className={cn(splitButtonSecondaryVariants(), className)}
      ref={ref}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
});

export {
  SplitButton,
  SplitButtonPrimary,
  SplitButtonSecondary,
  splitButtonPrimaryVariants,
  splitButtonSecondaryVariants,
};
