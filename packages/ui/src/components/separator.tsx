import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { cn } from "../lib/cn";

function Separator({
  className,
  decorative = true,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props & {
  decorative?: boolean;
}) {
  return (
    <SeparatorPrimitive
      className={cn(
        "shrink-0 bg-[var(--border)] data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className,
      )}
      data-slot="separator"
      orientation={orientation}
      render={decorative ? <div aria-hidden="true" role="presentation" /> : undefined}
      {...props}
    />
  );
}

export { Separator };
