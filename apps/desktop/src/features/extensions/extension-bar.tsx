import { StatusDot, cn } from "@lifecycle/ui";
import type { ExtensionSlot } from "./extension-bar-types";

export const WORKSPACE_EXTENSION_STRIP_WIDTH_PX = 40;

interface ExtensionBarProps {
  activeExtensionId: string | null;
  onToggleExtension: (extensionId: string) => void;
  slots: readonly ExtensionSlot[];
}

function ExtensionBadge({ slot }: { slot: ExtensionSlot }) {
  if (!slot.badge) {
    return null;
  }

  if (slot.badge.kind === "dot") {
    return (
      <span className="absolute right-1.5 top-1.5">
        <StatusDot aria-hidden size="sm" tone={slot.badge.tone} />
      </span>
    );
  }

  return (
    <span className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--status-danger)] px-1 text-[10px] font-semibold leading-none text-white">
      {slot.badge.value > 99 ? "99+" : slot.badge.value}
    </span>
  );
}

export function ExtensionBar({ activeExtensionId, onToggleExtension, slots }: ExtensionBarProps) {
  return (
    <aside
      className="flex h-full shrink-0 flex-col"
      data-slot="workspace-extension-strip"
      style={{ width: `${WORKSPACE_EXTENSION_STRIP_WIDTH_PX}px` }}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 py-2">
        {slots.map((slot) => {
          const Icon = slot.icon;
          const isActive = activeExtensionId === slot.id;
          return (
            <button
              key={slot.id}
              aria-label={slot.label}
              aria-pressed={isActive}
              className={cn(
                "relative inline-flex size-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] outline-none transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
                isActive
                  ? "bg-[var(--surface-selected)] text-[var(--foreground)] shadow-[inset_0_0_0_1px_var(--border)]"
                  : undefined,
              )}
              data-slot="workspace-extension-button"
              onClick={() => onToggleExtension(slot.id)}
              title={slot.label}
              type="button"
            >
              <Icon className="size-4" strokeWidth={2} />
              <ExtensionBadge slot={slot} />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
