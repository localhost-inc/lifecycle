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

function EmptyState({ icon, title, description, action, size = "lg", className }: EmptyStateProps) {
  const isSmall = size === "sm";

  return (
    <div
      className={cn(
        "flex flex-1 items-center justify-center text-center",
        isSmall ? "px-4 py-8" : "px-8 py-12",
        className,
      )}
    >
      <div className={cn("flex flex-col items-center", isSmall ? "gap-3" : "gap-4")}>
        {icon && (
          <div
            className={cn(
              "text-[var(--muted-foreground)]",
              isSmall ? "opacity-35 [&>svg]:size-8" : "opacity-22 [&>svg]:size-16",
            )}
          >
            {icon}
          </div>
        )}
        <div className={cn("flex flex-col items-center", isSmall ? "gap-1" : "gap-1.5")}>
          <p
            className={cn(
              "font-medium text-[var(--foreground)]",
              isSmall ? "text-sm" : "text-base",
            )}
          >
            {title}
          </p>
          {description && (
            <p
              className={cn(
                "text-[var(--muted-foreground)]",
                isSmall ? "max-w-xs text-xs leading-5" : "max-w-sm text-sm leading-6",
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
