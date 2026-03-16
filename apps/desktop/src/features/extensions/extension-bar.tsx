import { StatusDot } from "@lifecycle/ui";
import type { ExtensionSlot } from "./extension-bar-types";

interface ExtensionBarProps {
  activeExtensionId: string | null;
  onToggleExtension: (extensionId: string) => void;
  slots: readonly ExtensionSlot[];
}

function ExtensionIcon({ slot }: { slot: ExtensionSlot }) {
  const Icon = slot.icon;
  return (
    <span className="relative inline-flex">
      <Icon className="size-4" strokeWidth={2} />
      {slot.badge?.kind === "dot" ? (
        <span className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full bg-[var(--surface)] p-px">
          <StatusDot aria-hidden size="sm" tone={slot.badge.tone} />
        </span>
      ) : null}
    </span>
  );
}

export function ExtensionBar({ activeExtensionId, onToggleExtension, slots }: ExtensionBarProps) {
  return (
    <nav
      className="flex w-10 shrink-0 flex-col items-center gap-1 border-l border-[var(--border)] bg-[var(--surface)] py-2"
      data-slot="workspace-extension-strip"
    >
      {slots.map((slot) => {
        const isActive = activeExtensionId === slot.id;
        return (
          <button
            key={slot.id}
            aria-label={slot.label}
            className={[
              "flex size-7 items-center justify-center rounded-md transition-colors",
              isActive
                ? "bg-[var(--sidebar-selected)] text-[var(--foreground)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)]",
            ].join(" ")}
            onClick={() => onToggleExtension(slot.id)}
            title={slot.label}
            type="button"
          >
            <ExtensionIcon slot={slot} />
          </button>
        );
      })}
    </nav>
  );
}
