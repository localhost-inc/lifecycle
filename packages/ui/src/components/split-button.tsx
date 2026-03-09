import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const splitButtonPrimaryVariants = cva("compact-control-item compact-control-label", {
  variants: {
    variant: {
      foreground: "compact-control-tone-foreground",
      active: "compact-control-tone-active",
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
  "compact-control-item compact-control-icon compact-control-tone-muted compact-control-divider",
);

const SplitButton = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  function SplitButton({ className, ...props }, ref) {
    return <div className={cn("compact-control-shell", className)} ref={ref} {...props} />;
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
