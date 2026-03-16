import * as React from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "../lib/cn";

function Switch({
  children,
  className,
  ...props
}: SwitchPrimitive.Root.Props & { children?: React.ReactNode }) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-[var(--border)] bg-[var(--surface)] p-0.5 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:border-[color-mix(in_srgb,var(--primary)_70%,transparent)] data-[checked]:bg-[var(--primary)]",
        className,
      )}
      data-slot="switch"
      {...props}
    >
      {children ?? <SwitchThumb />}
    </SwitchPrimitive.Root>
  );
}

function SwitchThumb({ className, ...props }: SwitchPrimitive.Thumb.Props) {
  return (
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block size-4 rounded-full bg-[var(--card)] shadow-sm transition-transform duration-150 ease-in-out data-[checked]:translate-x-4",
        className,
      )}
      data-slot="switch-thumb"
      {...props}
    />
  );
}

export { Switch, SwitchThumb };
