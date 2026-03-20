import { StatusDot } from "@lifecycle/ui";
import { AnimatePresence, motion } from "motion/react";
import type { ExtensionSlot } from "@/features/extensions/extension-bar-types";

interface ExtensionBarProps {
  activeExtensionId: string | null;
  onSelectExtension: (extensionId: string) => void;
  slots: readonly ExtensionSlot[];
}

function ExtensionIcon({ slot }: { slot: ExtensionSlot }) {
  const Icon = slot.icon;
  return (
    <span className="relative inline-flex">
      <Icon className="size-4" strokeWidth={2} />
      {slot.badge?.kind === "dot" ? (
        <span className="absolute -bottom-[3px] -right-[3px] flex items-center justify-center rounded-full bg-[var(--surface)] p-px">
          <StatusDot aria-hidden size="sm" tone={slot.badge.tone} />
        </span>
      ) : null}
    </span>
  );
}

export function ExtensionBar({ activeExtensionId, onSelectExtension, slots }: ExtensionBarProps) {
  return (
    <nav
      className="flex h-9 shrink-0 flex-row items-stretch overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)] bg-[var(--background)]"
      data-slot="workspace-extension-strip"
    >
      {slots.map((slot) => {
        const isActive = activeExtensionId === slot.id;
        return (
          <button
            key={slot.id}
            aria-label={slot.label}
            className={[
              "relative flex items-center justify-center border-r border-[var(--border)] transition-colors",
              isActive
                ? "gap-1.5 px-2.5 bg-[var(--surface)] text-[var(--foreground)] -mb-px z-[1] pb-px"
                : "aspect-square text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
            ].join(" ")}
            onClick={() => onSelectExtension(slot.id)}
            title={slot.label}
            type="button"
          >
            <ExtensionIcon slot={slot} />
            <AnimatePresence initial={false}>
              {isActive && (
                <motion.span
                  key={slot.id}
                  animate={{ width: "auto", opacity: 1 }}
                  className="min-w-0 overflow-hidden truncate text-[13px] font-medium leading-none"
                  exit={{ width: 0, opacity: 0 }}
                  initial={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  {slot.label}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        );
      })}
    </nav>
  );
}
