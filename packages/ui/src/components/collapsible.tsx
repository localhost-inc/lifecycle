import * as React from "react";
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { getAsChildRenderElement } from "../lib/as-child";

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return (
    <CollapsiblePrimitive.Root
      data-slot="collapsible"
      render={(renderProps, state) => (
        <div {...renderProps} data-state={state.open ? "open" : "closed"} />
      )}
      {...props}
    />
  );
}

function CollapsibleTrigger({
  asChild = false,
  children,
  nativeButton,
  ...props
}: CollapsiblePrimitive.Trigger.Props & {
  asChild?: boolean;
}) {
  const render = asChild ? getAsChildRenderElement(children) : undefined;

  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      nativeButton={asChild ? false : nativeButton}
      render={
        render ??
        ((renderProps, state) => (
          <button {...renderProps} data-state={state.open ? "open" : "closed"} />
        ))
      }
      {...props}
    >
      {asChild ? undefined : children}
    </CollapsiblePrimitive.Trigger>
  );
}

function CollapsibleContent({ ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      render={(renderProps, state) => (
        <div {...renderProps} data-state={state.open ? "open" : "closed"} />
      )}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
