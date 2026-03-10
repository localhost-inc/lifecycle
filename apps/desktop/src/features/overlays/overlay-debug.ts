interface OverlayDebugEntry {
  at: string;
  detail: unknown;
  step: string;
}

const OVERLAY_DEBUG_WINDOW_KEY = "__lifecycleOverlayDebug";
const MAX_OVERLAY_DEBUG_ENTRIES = 200;

type OverlayDebugWindow = Window & {
  __lifecycleOverlayDebug?: OverlayDebugEntry[];
};

function isOverlayDebugEnabled(): boolean {
  return import.meta.env.DEV;
}

function overlayDebugWindow(): OverlayDebugWindow | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window as OverlayDebugWindow;
}

export function logOverlayDebug(step: string, detail: unknown = {}): void {
  if (!isOverlayDebugEnabled()) {
    return;
  }

  const entry: OverlayDebugEntry = {
    at: new Date().toISOString(),
    detail,
    step,
  };

  const targetWindow = overlayDebugWindow();
  if (targetWindow) {
    const entries = targetWindow[OVERLAY_DEBUG_WINDOW_KEY] ?? [];
    entries.push(entry);
    if (entries.length > MAX_OVERLAY_DEBUG_ENTRIES) {
      entries.splice(0, entries.length - MAX_OVERLAY_DEBUG_ENTRIES);
    }
    targetWindow[OVERLAY_DEBUG_WINDOW_KEY] = entries;
  }

  console.info(`[overlay] ${step}`, detail);
}
