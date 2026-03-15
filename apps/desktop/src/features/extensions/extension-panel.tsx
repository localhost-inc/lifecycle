import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { ExtensionSlot } from "./extension-bar-types";

interface ExtensionPanelProps {
  activeSlot: ExtensionSlot | null;
  maxWidth: number;
  minWidth: number;
  onResizeKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  width: number;
}

export function ExtensionPanel({
  activeSlot,
  maxWidth,
  minWidth,
  onResizeKeyDown,
  onResizePointerDown,
  width,
}: ExtensionPanelProps) {
  if (!activeSlot) {
    return null;
  }

  return (
    <>
      <div className="relative w-0 shrink-0">
        <div
          aria-label="Resize workspace extension panel"
          aria-orientation="vertical"
          aria-valuemax={maxWidth}
          aria-valuemin={minWidth}
          aria-valuenow={width}
          className="absolute inset-y-0 -left-2 z-20 w-4 cursor-col-resize"
          onKeyDown={onResizeKeyDown}
          onPointerDown={onResizePointerDown}
          role="separator"
          tabIndex={0}
        />
      </div>
      <aside
        className="min-h-0 shrink-0 border-r border-[var(--border)] overflow-hidden"
        data-slot="workspace-extension-panel"
        style={{ width: `${width}px` }}
      >
        {activeSlot.panel}
      </aside>
    </>
  );
}
