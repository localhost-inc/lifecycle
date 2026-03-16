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
      className="flex w-10 shrink-0 flex-col items-stretch border-l border-[var(--border)] bg-[var(--background)]"
      data-slot="workspace-extension-strip"
    >
      {slots.map((slot) => {
        const isActive = activeExtensionId === slot.id;
        return (
          <button
            key={slot.id}
            aria-label={slot.label}
            className={[
              "relative flex h-9 items-center justify-center border-b border-[var(--border)] transition-colors",
              isActive
                ? "bg-[var(--surface)] text-[var(--foreground)] -ml-px z-[1] pl-px"
                : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
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
