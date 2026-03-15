import * as React from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { getAsChildRenderElement } from "../lib/as-child";
import { cn } from "../lib/cn";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl text-xs font-semibold transition-[background-color,border-color,color,opacity,transform] duration-150 ease-in-out outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] active:scale-[0.97] disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--muted),var(--foreground)_8%)]",
        secondary:
          "border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
        outline:
          "border border-[var(--border)] bg-transparent text-[var(--foreground)] hover:bg-[var(--surface-hover)]",
        ghost:
          "bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
        destructive:
          "border border-[color-mix(in_srgb,var(--destructive)_35%,transparent)] bg-transparent text-[var(--destructive)] hover:border-[color-mix(in_srgb,var(--destructive)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)]",
        white: "bg-white text-black hover:bg-white/90",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-8 px-3",
        lg: "h-10 px-4 text-sm",
        icon: "h-8 w-8 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<typeof ButtonPrimitive>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({
  asChild = false,
  className,
  children,
  nativeButton,
  size,
  type = "button",
  variant,
  ...props
}: ButtonProps) {
  const render = asChild ? getAsChildRenderElement(children) : undefined;

  return (
    <ButtonPrimitive
      className={cn(buttonVariants({ className, size, variant }))}
      data-slot="button"
      nativeButton={asChild ? false : nativeButton}
      render={render}
      type={asChild ? undefined : type}
      {...props}
    >
      {asChild ? undefined : children}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
