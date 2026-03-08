import * as React from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeft } from "lucide-react";
import { getAsChildRenderElement } from "../lib/as-child";
import { cn } from "../lib/cn";
import { Button } from "./button";
import { Separator } from "./separator";

const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_ICON = "3rem";

type SidebarContextValue = {
  open: boolean;
  setOpen: (value: boolean | ((value: boolean) => boolean)) => void;
  state: "expanded" | "collapsed";
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

type SidebarProviderProps = React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  sidebarWidth?: string;
  sidebarWidthIcon?: string;
};

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className,
  style,
  children,
  sidebarWidth = SIDEBAR_WIDTH,
  sidebarWidthIcon = SIDEBAR_WIDTH_ICON,
  ...props
}: SidebarProviderProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;

  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const nextOpen = typeof value === "function" ? value(open) : value;
      if (onOpenChange) {
        onOpenChange(nextOpen);
        return;
      }

      setUncontrolledOpen(nextOpen);
    },
    [onOpenChange, open],
  );

  const toggleSidebar = React.useCallback(() => {
    setOpen((currentOpen) => !currentOpen);
  }, [setOpen]);

  const contextValue = React.useMemo<SidebarContextValue>(
    () => ({
      open,
      setOpen,
      state: open ? "expanded" : "collapsed",
      toggleSidebar,
    }),
    [open, setOpen, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        className={cn("group/sidebar-wrapper flex min-h-0 w-full", className)}
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": sidebarWidth,
            "--sidebar-width-icon": sidebarWidthIcon,
            ...style,
          } as React.CSSProperties
        }
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

type SidebarProps = React.ComponentProps<"aside"> & {
  collapsible?: "icon" | "none" | "offcanvas";
  side?: "left" | "right";
  variant?: "floating" | "inset" | "sidebar";
};

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "none",
  className,
  style,
  children,
  ...props
}: SidebarProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const width =
    collapsible === "icon" && isCollapsed ? "var(--sidebar-width-icon)" : "var(--sidebar-width)";

  return (
    <aside
      className={cn(
        "peer/sidebar flex h-full min-h-0 shrink-0 flex-col bg-[var(--sidebar-background)] text-[var(--sidebar-foreground)]",
        collapsible !== "none" && "overflow-hidden transition-[width] duration-200 ease-linear",
        variant === "floating" && "border border-[var(--border)]",
        className,
      )}
      data-collapsible={isCollapsed ? collapsible : ""}
      data-side={side}
      data-slot="sidebar"
      data-state={state}
      data-variant={variant}
      style={{ width, ...style }}
      {...props}
    >
      {children}
    </aside>
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--background)]", className)}
      data-slot="sidebar-inset"
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 flex-col gap-2 p-2", className)}
      data-sidebar="header"
      data-slot="sidebar-header"
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 flex-col gap-2 p-2", className)}
      data-sidebar="footer"
      data-slot="sidebar-footer"
      {...props}
    />
  );
}

function SidebarSeparator({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      className={cn("bg-[var(--border)]", className)}
      data-sidebar="separator"
      data-slot="sidebar-separator"
      orientation={orientation}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden", className)}
      data-sidebar="content"
      data-slot="sidebar-content"
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex w-full min-w-0 flex-col p-2", className)}
      data-sidebar="group"
      data-slot="sidebar-group"
      {...props}
    />
  );
}

function SidebarGroupLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "px-2 py-1 text-[11px] font-medium tracking-wide text-[var(--sidebar-muted-foreground)] uppercase",
        className,
      )}
      data-sidebar="group-label"
      data-slot="sidebar-group-label"
      {...props}
    />
  );
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("w-full text-sm", className)}
      data-sidebar="group-content"
      data-slot="sidebar-group-content"
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      data-sidebar="menu"
      data-slot="sidebar-menu"
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      className={cn("group/menu-item relative", className)}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  "flex w-full cursor-pointer items-center gap-2 overflow-hidden px-2 py-1.5 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      active: {
        false:
          "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]",
        true: "bg-[var(--sidebar-selected)] text-[var(--sidebar-foreground)]",
      },
      size: {
        default: "min-h-8",
        sm: "min-h-7 text-xs",
        lg: "min-h-10 text-sm",
      },
      variant: {
        default: "",
        outline:
          "border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--sidebar-hover)]",
      },
    },
    defaultVariants: {
      active: false,
      size: "default",
      variant: "default",
    },
  },
);

type SidebarMenuButtonProps = Omit<React.ComponentProps<typeof ButtonPrimitive>, "children"> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    asChild?: boolean;
    children?: React.ReactNode;
    isActive?: boolean;
  };

function SidebarMenuButton({
  asChild = false,
  children,
  className,
  isActive = false,
  nativeButton,
  size,
  type = "button",
  variant,
  ...props
}: SidebarMenuButtonProps) {
  const render = asChild ? getAsChildRenderElement(children) : undefined;

  return (
    <ButtonPrimitive
      className={cn(sidebarMenuButtonVariants({ active: isActive, className, size, variant }))}
      data-active={isActive}
      data-sidebar="menu-button"
      data-slot="sidebar-menu-button"
      nativeButton={asChild ? false : nativeButton}
      render={render}
      type={asChild ? undefined : type}
      {...props}
    >
      {asChild ? undefined : children}
    </ButtonPrimitive>
  );
}

type SidebarMenuActionProps = Omit<React.ComponentProps<typeof ButtonPrimitive>, "children"> & {
  asChild?: boolean;
  children?: React.ReactNode;
  showOnHover?: boolean;
};

function SidebarMenuAction({
  asChild = false,
  children,
  className,
  nativeButton,
  showOnHover = false,
  type = "button",
  ...props
}: SidebarMenuActionProps) {
  const render = asChild ? getAsChildRenderElement(children) : undefined;

  return (
    <ButtonPrimitive
      className={cn(
        "absolute right-1 top-1/2 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center text-[var(--sidebar-muted-foreground)] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[var(--ring)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)] disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50",
        showOnHover &&
          "opacity-0 group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100",
        className,
      )}
      data-sidebar="menu-action"
      data-slot="sidebar-menu-action"
      nativeButton={asChild ? false : nativeButton}
      render={render}
      type={asChild ? undefined : type}
      {...props}
    >
      {asChild ? undefined : children}
    </ButtonPrimitive>
  );
}

const sidebarMenuSubButtonVariants = cva(
  "flex w-full cursor-pointer items-center gap-2 overflow-hidden px-2 py-1.5 text-left text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      active: {
        false:
          "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]",
        true: "bg-[var(--sidebar-selected)] text-[var(--sidebar-foreground)]",
      },
      size: {
        sm: "text-xs",
        md: "text-sm",
      },
    },
    defaultVariants: {
      active: false,
      size: "md",
    },
  },
);

type SidebarMenuSubButtonProps = Omit<React.ComponentProps<typeof ButtonPrimitive>, "children"> &
  VariantProps<typeof sidebarMenuSubButtonVariants> & {
    asChild?: boolean;
    children?: React.ReactNode;
    isActive?: boolean;
  };

function SidebarMenuSubButton({
  asChild = false,
  children,
  className,
  isActive = false,
  nativeButton,
  size,
  type = "button",
  ...props
}: SidebarMenuSubButtonProps) {
  const render = asChild ? getAsChildRenderElement(children) : undefined;

  return (
    <ButtonPrimitive
      className={cn(sidebarMenuSubButtonVariants({ active: isActive, className, size }))}
      data-active={isActive}
      data-sidebar="menu-sub-button"
      data-slot="sidebar-menu-sub-button"
      nativeButton={asChild ? false : nativeButton}
      render={render}
      type={asChild ? undefined : type}
      {...props}
    >
      {asChild ? undefined : children}
    </ButtonPrimitive>
  );
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "ml-3 flex min-w-0 flex-col gap-1 border-l border-[var(--border)] py-0.5 pl-2",
        className,
      )}
      data-sidebar="menu-sub"
      data-slot="sidebar-menu-sub"
      {...props}
    />
  );
}

function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      className={cn("group/menu-sub-item relative", className)}
      data-sidebar="menu-sub-item"
      data-slot="sidebar-menu-sub-item"
      {...props}
    />
  );
}

function SidebarTrigger({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();
  const { onClick, ...buttonProps } = props;

  return (
    <Button
      className={cn("h-7 w-7 p-0", className)}
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      size="icon"
      variant="ghost"
      {...buttonProps}
    >
      <PanelLeft size={14} />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  );
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar();
  const { onClick, ...buttonProps } = props;

  return (
    <button
      aria-label="Toggle sidebar"
      className={cn(
        "absolute inset-y-0 right-0 hidden w-3 translate-x-1/2 cursor-pointer bg-transparent sm:flex",
        className,
      )}
      data-sidebar="rail"
      data-slot="sidebar-rail"
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      tabIndex={-1}
      title="Toggle sidebar"
      type="button"
      {...buttonProps}
    />
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  sidebarMenuButtonVariants,
  sidebarMenuSubButtonVariants,
  useSidebar,
};
