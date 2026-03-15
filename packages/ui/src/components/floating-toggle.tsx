import type * as React from "react";
import { cn } from "../lib/cn";

export interface FloatingToggleOption<T extends string> {
  ariaLabel: string;
  content: React.ReactNode;
  itemClassName?: string;
  title?: string;
  value: T;
}

interface FloatingToggleProps<T extends string> {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onValueChange: (value: T) => void;
  options: readonly FloatingToggleOption<T>[];
  value: T;
  wrapperClassName?: string;
}

export function FloatingToggle<T extends string>({
  ariaLabel,
  className,
  disabled = false,
  onValueChange,
  options,
  value,
  wrapperClassName,
}: FloatingToggleProps<T>) {
  return (
    <div
      className={cn("pointer-events-none absolute bottom-4 right-4 z-20", wrapperClassName)}
      data-slot="floating-toggle-wrapper"
    >
      <div
        aria-label={ariaLabel}
        className={cn(
          "pointer-events-auto inline-flex items-center gap-1 rounded-full border px-1 py-1 shadow-[0_18px_48px_color-mix(in_srgb,var(--foreground)_12%,transparent)] backdrop-blur-xl",
          "border-[color-mix(in_srgb,var(--border)_82%,transparent)] bg-[color-mix(in_srgb,var(--background)_74%,transparent)]",
          disabled && "opacity-70",
          className,
        )}
        data-slot="floating-toggle"
        role="group"
      >
        {options.map((option) => {
          const active = option.value === value;

          return (
            <button
              key={option.value}
              aria-label={option.ariaLabel}
              aria-pressed={active}
              className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-full text-xs font-medium leading-none transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:pointer-events-none",
                active
                  ? "bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] text-[var(--foreground)] shadow-[0_8px_24px_color-mix(in_srgb,var(--foreground)_10%,transparent)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                option.itemClassName,
              )}
              disabled={disabled}
              onClick={() => onValueChange(option.value)}
              title={option.title}
              type="button"
            >
              <span className="inline-flex items-center justify-center">{option.content}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
