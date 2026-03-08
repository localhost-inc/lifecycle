import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "../lib/cn";

function Tabs(props: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" {...props} />;
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex items-center gap-1 p-1", className)}
      data-slot="tabs-list"
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-[8px] px-2.5 py-0.5 text-xs font-medium text-[var(--muted-foreground)] transition-all outline-none hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 data-active:bg-[var(--surface-selected)] data-active:text-[var(--foreground)] data-active:shadow-[var(--tab-shadow)]",
        className,
      )}
      data-slot="tabs-trigger"
      render={(renderProps, state) => (
        <button {...renderProps} data-state={state.active ? "active" : "inactive"} />
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      className={cn(
        "outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
        className,
      )}
      data-slot="tabs-content"
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
