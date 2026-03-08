import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { getAsChildRenderElement } from "../lib/as-child";
import { cn } from "../lib/cn";

function TooltipProvider({ delay = 150, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />;
}

function Tooltip(props: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({
  asChild = false,
  children,
  ...props
}: TooltipPrimitive.Trigger.Props & {
  asChild?: boolean;
}) {
  const render = asChild ? getAsChildRenderElement(children) : undefined;

  return (
    <TooltipPrimitive.Trigger data-slot="tooltip-trigger" render={render} {...props}>
      {asChild ? undefined : children}
    </TooltipPrimitive.Trigger>
  );
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 8,
  align = "center",
  alignOffset = 0,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        className="z-50"
        side={side}
        sideOffset={sideOffset}
      >
        <TooltipPrimitive.Popup
          className={cn(
            "z-50 border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--foreground)] shadow-none rounded-none",
            className,
          )}
          data-slot="tooltip-content"
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent };
