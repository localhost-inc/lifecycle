import * as React from "react";
import { cn } from "../lib/cn";

interface EmptyStateProps {
  /** Lucide icon or custom SVG node rendered above the title */
  icon?: React.ReactNode;
  /** Primary message */
  title: string;
  /** Optional secondary description */
  description?: string;
  /** Optional action slot (button, link, etc.) */
  action?: React.ReactNode;
  /**
   * `"sm"` — compact, for sidebar panels (smaller text, tighter spacing)
   * `"lg"` — full-area, for main content panels (larger text, more breathing room)
   * @default "lg"
   */
  size?: "sm" | "lg";
  className?: string;
}

function EmptyState({
  icon,
  title,
  description,
  action,
  size = "lg",
  className,
}: EmptyStateProps) {
  const isSmall = size === "sm";

  return (
    <div
      className={cn(
        "flex items-center justify-center text-center",
        isSmall ? "px-4 py-8" : "flex-1 px-8 py-12",
        className,
      )}
    >
      <div className={cn("flex flex-col items-center", isSmall ? "gap-3" : "gap-4")}>
        {icon && (
          <div
            className={cn(
              "text-[var(--muted-foreground)]",
              isSmall ? "opacity-30 [&>svg]:size-10" : "opacity-20 [&>svg]:size-12",
            )}
          >
            {icon}
          </div>
        )}
        <div className={cn("flex flex-col items-center", isSmall ? "gap-1" : "gap-1.5")}>
          <p
            className={cn(
              "font-medium text-[var(--foreground)]",
              isSmall ? "text-xs" : "text-sm",
            )}
          >
            {title}
          </p>
          {description && (
            <p
              className={cn(
                "max-w-xs text-[var(--muted-foreground)]",
                isSmall ? "text-[11px]" : "text-xs",
              )}
            >
              {description}
            </p>
          )}
        </div>
        {action && <div className={cn(isSmall ? "mt-1" : "mt-2")}>{action}</div>}
      </div>
    </div>
  );
}

export { EmptyState, type EmptyStateProps };
