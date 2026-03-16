import type { ExtensionSlot } from "./extension-bar-types";

interface ExtensionPanelProps {
  activeSlot: ExtensionSlot | null;
}

export function ExtensionPanel({ activeSlot }: ExtensionPanelProps) {
  if (!activeSlot) {
    return null;
  }

  return (
    <aside className="min-h-0 min-w-0 flex-1 overflow-hidden" data-slot="workspace-extension-panel">
      {activeSlot.panel}
    </aside>
  );
}
