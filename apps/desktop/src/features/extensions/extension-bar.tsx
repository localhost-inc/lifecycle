import { StatusDot } from "@lifecycle/ui";
import { TabChip } from "../../components/tab-chip";
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
      <Icon className="size-3.5" strokeWidth={2} />
      {slot.badge?.kind === "dot" ? (
        <span className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full bg-[var(--background)] p-px">
          <StatusDot aria-hidden size="sm" tone={slot.badge.tone} />
        </span>
      ) : null}
    </span>
  );
}

export function ExtensionBar({ activeExtensionId, onToggleExtension, slots }: ExtensionBarProps) {
  return (
    <nav
      className="flex h-8 shrink-0 items-stretch overflow-x-auto border-b border-[var(--border)]"
      data-slot="workspace-extension-strip"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
    >
      {slots.map((slot) => {
        const isActive = activeExtensionId === slot.id;
        return (
          <TabChip
            key={slot.id}
            active={isActive}
            closable={false}
            label={slot.label}
            leading={<ExtensionIcon slot={slot} />}
            onClick={() => onToggleExtension(slot.id)}
          />
        );
      })}
    </nav>
  );
}
