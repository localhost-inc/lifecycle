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
        "inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-[var(--foreground)]/15 p-0.5 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-[var(--ring)]/25",
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
        "pointer-events-none block size-4 rounded-full bg-[var(--foreground)]/60 shadow-sm transition-transform duration-150 ease-in-out data-[checked]:bg-[var(--ring)] data-[checked]:translate-x-4",
        className,
      )}
      data-slot="switch-thumb"
      {...props}
    />
  );
}

export { Switch, SwitchThumb };
