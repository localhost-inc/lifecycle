import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { getAsChildRenderElement } from "../lib/as-child";
import { cn } from "../lib/cn";
function Popover(props: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  asChild = false,
  children,
  ...props
}: PopoverPrimitive.Trigger.Props & {
  asChild?: boolean;
}) {
  const render = asChild ? getAsChildRenderElement(children) : undefined;

  return (
    <PopoverPrimitive.Trigger data-slot="popover-trigger" render={render} {...props}>
      {asChild ? undefined : children}
    </PopoverPrimitive.Trigger>
  );
}

function PopoverContent({
  className,
  side = "bottom",
  sideOffset = 8,
  align = "start",
  alignOffset = 0,
  container,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset"> & {
    container?: PopoverPrimitive.Portal.Props["container"];
  }) {
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        className="z-50"
        side={side}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          className={cn(
            "z-50 w-72 border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--foreground)] shadow-lg outline-none",
            "origin-[var(--transform-origin)] transition-[transform,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className,
          )}
          data-slot="popover-content"
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
