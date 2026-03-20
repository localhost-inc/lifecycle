import * as React from "react";
import { cn } from "../lib/cn";

export interface OptionListItem<T extends string> {
  icon?: React.ReactNode;
  label: string;
  value: T;
}

export interface OptionListProps<T extends string> {
  className?: string;
  items: readonly OptionListItem<T>[];
  onChange: (value: T) => void;
  value: T;
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function OptionList<T extends string>({ className, items, onChange, value }: OptionListProps<T>) {
  return (
    <div
      className={cn(
        "divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]",
        className,
      )}
      role="listbox"
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            aria-selected={selected}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)] first:rounded-t-xl last:rounded-b-xl"
            onClick={() => onChange(item.value)}
            role="option"
            type="button"
          >
            {item.icon && (
              <span className="flex size-4 shrink-0 items-center justify-center text-[var(--muted-foreground)]">
                {item.icon}
              </span>
            )}
            <span className="flex-1">{item.label}</span>
            {selected && <CheckIcon className="size-4 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

export { OptionList };
