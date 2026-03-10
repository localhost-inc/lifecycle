import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "../lib/cn";

type TabsVariant = "segmented" | "underline";

interface TabsListProps extends TabsPrimitive.List.Props {
  variant?: TabsVariant;
}

interface TabsTriggerProps extends TabsPrimitive.Tab.Props {
  variant?: TabsVariant;
}

function Tabs(props: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" {...props} />;
}

function TabsList({ className, variant = "segmented", ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List
      className={cn(
        variant === "underline"
          ? "flex w-full items-stretch border-b border-[var(--border)]"
          : "compact-control-shell",
        className,
      )}
      data-slot="tabs-list"
      {...props}
    />
  );
}

function TabsTrigger({ className, variant = "segmented", ...props }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        variant === "underline"
          ? "compact-control-item compact-control-underline-tab"
          : "compact-control-item compact-control-tab compact-control-tone-muted compact-control-divider data-active:bg-[var(--surface-selected)] data-active:text-[var(--foreground)] data-[state=active]:bg-[var(--surface-selected)] data-[state=active]:text-[var(--foreground)]",
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
