import { cn } from "@lifecycle/ui";
import { GIT_DIFF_STYLE_OPTIONS, gitDiffStyleLabel, type GitDiffStyle } from "../lib/diff-style";

interface DiffStyleToggleProps {
  diffStyle: GitDiffStyle;
  disabled: boolean;
  onChange: (nextDiffStyle: GitDiffStyle) => void;
}

export function DiffStyleToggle({
  diffStyle,
  disabled,
  onChange,
}: DiffStyleToggleProps) {
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-20">
      <div
        aria-label="Diff view mode"
        className={cn(
          "pointer-events-auto inline-flex items-center gap-1 rounded-full border px-1 py-1 shadow-[0_18px_48px_color-mix(in_srgb,var(--foreground)_12%,transparent)] backdrop-blur-xl",
          "border-[color-mix(in_srgb,var(--border)_82%,transparent)] bg-[color-mix(in_srgb,var(--background)_74%,transparent)]",
          disabled && "opacity-70",
        )}
        role="group"
      >
        {GIT_DIFF_STYLE_OPTIONS.map((option) => {
          const active = diffStyle === option;

          return (
            <button
              key={option}
              aria-pressed={active}
              className={cn(
                "min-w-[76px] rounded-full px-3 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:pointer-events-none",
                active
                  ? "bg-[color-mix(in_srgb,var(--panel)_92%,transparent)] text-[var(--foreground)] shadow-[0_8px_24px_color-mix(in_srgb,var(--foreground)_10%,transparent)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
              )}
              disabled={disabled}
              onClick={() => onChange(option)}
              type="button"
            >
              {gitDiffStyleLabel(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
