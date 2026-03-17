import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "../lib/cn";

type TabsVariant = "pill" | "segmented" | "underline";

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
          : variant === "pill"
            ? "inline-flex items-center gap-1.5"
            : "inline-flex items-center overflow-hidden rounded-xl bg-[var(--muted)]",
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
          ? "relative inline-flex flex-1 items-center justify-center whitespace-nowrap px-3 py-2 text-[13px] font-medium text-[var(--muted-foreground)] shadow-[inset_0_-1px_0_0_transparent] outline-none transition-[background-color,border-color,color,opacity] duration-150 ease-in-out hover:text-[var(--foreground)] focus-visible:shadow-[0_0_0_1px_var(--ring)] disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-[var(--foreground)] data-[state=active]:shadow-[inset_0_-1px_0_0_var(--foreground)]"
          : variant === "pill"
            ? "inline-flex h-7 items-center justify-center whitespace-nowrap rounded-full px-3 text-xs font-medium text-[var(--muted-foreground)] outline-none transition-[background-color,color,opacity] duration-150 ease-in-out hover:bg-[var(--foreground)]/6 hover:text-[var(--foreground)] focus-visible:shadow-[0_0_0_1px_var(--ring)] disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-[var(--muted)] data-[state=active]:text-[var(--foreground)]"
            : "inline-flex h-8 items-center justify-center whitespace-nowrap px-3.5 text-xs font-semibold text-[var(--muted-foreground)] border-l border-[var(--background)] outline-none transition-[background-color,border-color,color,opacity] duration-150 ease-in-out hover:bg-[var(--foreground)]/8 hover:text-[var(--foreground)] focus-visible:shadow-[0_0_0_1px_var(--ring)] disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-[var(--surface-selected)] data-[state=active]:text-[var(--foreground)]",
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
