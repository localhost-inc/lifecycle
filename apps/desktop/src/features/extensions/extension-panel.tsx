import { Suspense } from "react";
import type { ExtensionSlot } from "@/features/extensions/extension-bar-types";

interface ExtensionPanelProps {
  activeSlot: ExtensionSlot | null;
}

export function ExtensionPanel({ activeSlot }: ExtensionPanelProps) {
  if (!activeSlot) {
    return null;
  }

  return (
    <aside className="min-h-0 min-w-0 flex-1 overflow-hidden" data-slot="workspace-extension-panel">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center px-4 text-sm text-[var(--muted-foreground)]">
            Loading panel...
          </div>
        }
      >
        {activeSlot.panel}
      </Suspense>
    </aside>
  );
}
