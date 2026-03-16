import type { TerminalRecord } from "@lifecycle/contracts";
import { Alert, AlertDescription, EmptyState, themeAppearance, useTheme } from "@lifecycle/ui";
import { TerminalSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { subscribeToShellResize } from "../../../components/layout/shell-resize-provider";
import { measureAsyncPerformance } from "../../../lib/performance";
import {
  DEFAULT_MONOSPACE_FONT_FAMILY,
  getNativeMonospaceFontFamily,
} from "../../../lib/typography";
import { terminalHasLiveSession } from "../api";
import {
  hideNativeTerminalSurface,
  syncNativeTerminalSurface,
  syncNativeTerminalSurfaceFrame,
} from "../native-surface-api";
import { DEFAULT_TERMINAL_FONT_SIZE } from "../terminal-display";
import { resolveTerminalTheme } from "../terminal-theme";

interface NativeTerminalSurfaceProps {
  focused: boolean;
  opacity: number;
  tabDragInProgress?: boolean;
  terminal: TerminalRecord;
}

type NativeTerminalSurfaceAttachState = "attached" | "attaching" | "failed";

interface NativeTerminalSurfaceLease {
  owner: symbol;
  pendingHideFrameId: number | null;
}

type NativeTerminalSurfaceSyncResultAction = "apply" | "hide" | "ignore";

interface NativeTerminalSurfaceSyncCoordinator {
  cancelScheduledSync: () => void;
  flushSync: () => Promise<void>;
  scheduleSync: () => void;
}

// DOM splitters cannot stack above the sibling native NSView, so keep the
// embedded surface slightly inset from the shell seams.
const NATIVE_TERMINAL_EDGE_GUTTER_PX = 3;
const nativeTerminalSurfaceLeaseRegistry = createNativeTerminalSurfaceLeaseRegistry();

export function shouldShowNativeTerminalSurface({
  hasLiveSession,
  height,
  width,
}: {
  hasLiveSession: boolean;
  height: number;
  width: number;
}): boolean {
  return hasLiveSession && width > 1 && height > 1;
}

export function shouldHideNativeTerminalSurfaceForTabDrag({
  hasLiveSession,
  height,
  tabDragInProgress,
  width,
}: {
  hasLiveSession: boolean;
  height: number;
  tabDragInProgress: boolean;
  width: number;
}): boolean {
  return hasLiveSession && width > 1 && height > 1 && tabDragInProgress;
}

export function resolveNativeTerminalSurfaceInteraction({
  focused,
  shellResizeInProgress,
  visible,
}: {
  focused: boolean;
  shellResizeInProgress: boolean;
  visible: boolean;
}): { focused: boolean; pointerPassthrough: boolean } {
  return {
    focused: visible && focused && !shellResizeInProgress,
    pointerPassthrough: shellResizeInProgress || !focused,
  };
}

export function createNativeTerminalSurfaceLeaseRegistry(): Map<
  string,
  NativeTerminalSurfaceLease
> {
  return new Map<string, NativeTerminalSurfaceLease>();
}

export function claimNativeTerminalSurfaceLease(
  registry: Map<string, NativeTerminalSurfaceLease>,
  terminalId: string,
  owner: symbol,
  cancelFrame: (frameId: number) => void,
): void {
  const existingLease = registry.get(terminalId);
  if (existingLease && existingLease.pendingHideFrameId !== null) {
    cancelFrame(existingLease.pendingHideFrameId);
  }

  registry.set(terminalId, {
    owner,
    pendingHideFrameId: null,
  });
}

export function scheduleNativeTerminalSurfaceLeaseHide(
  registry: Map<string, NativeTerminalSurfaceLease>,
  terminalId: string,
  owner: symbol,
  requestFrame: (callback: FrameRequestCallback) => number,
  cancelFrame: (frameId: number) => void,
  hideSurface: (terminalId: string) => void,
): number | null {
  const existingLease = registry.get(terminalId);
  if (!existingLease || existingLease.owner !== owner) {
    return null;
  }

  if (existingLease.pendingHideFrameId !== null) {
    cancelFrame(existingLease.pendingHideFrameId);
  }

  const frameId = requestFrame(() => {
    const pendingLease = registry.get(terminalId);
    if (
      !pendingLease ||
      pendingLease.owner !== owner ||
      pendingLease.pendingHideFrameId !== frameId
    ) {
      return;
    }

    registry.delete(terminalId);
    hideSurface(terminalId);
  });

  registry.set(terminalId, {
    owner,
    pendingHideFrameId: frameId,
  });

  return frameId;
}

export function resolveNativeTerminalSurfaceSyncResultAction({
  currentLifecycleToken,
  lifecycleToken,
  registry,
  terminalId,
}: {
  currentLifecycleToken: number;
  lifecycleToken: number;
  registry: Map<string, NativeTerminalSurfaceLease>;
  terminalId: string;
}): NativeTerminalSurfaceSyncResultAction {
  if (currentLifecycleToken === lifecycleToken) {
    return "apply";
  }

  return registry.has(terminalId) ? "ignore" : "hide";
}

export function createNativeTerminalSurfaceSyncCoordinator({
  cancelFrame,
  requestFrame,
  sync,
}: {
  cancelFrame: (frameId: number) => void;
  requestFrame: (callback: FrameRequestCallback) => number;
  sync: () => Promise<void>;
}): NativeTerminalSurfaceSyncCoordinator {
  let activeSync: Promise<void> | null = null;
  let frameId: number | null = null;
  let resyncRequested = false;

  const runSyncLoop = (): Promise<void> => {
    if (activeSync) {
      resyncRequested = true;
      return activeSync;
    }

    activeSync = (async () => {
      try {
        do {
          resyncRequested = false;
          await sync();
        } while (resyncRequested);
      } finally {
        activeSync = null;
      }
    })();

    return activeSync;
  };

  return {
    cancelScheduledSync: () => {
      if (frameId !== null) {
        cancelFrame(frameId);
        frameId = null;
      }
      resyncRequested = false;
    },
    flushSync: () => {
      if (frameId !== null) {
        cancelFrame(frameId);
        frameId = null;
      }

      return runSyncLoop();
    },
    scheduleSync: () => {
      if (frameId !== null) {
        return;
      }

      if (activeSync !== null) {
        resyncRequested = true;
        return;
      }

      frameId = requestFrame(() => {
        frameId = null;
        void runSyncLoop();
      });
    },
  };
}

function readNativeTerminalMonospaceFontFamily(): string {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") {
    return getNativeMonospaceFontFamily(DEFAULT_MONOSPACE_FONT_FAMILY);
  }

  const configuredFontFamily = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-mono")
    .trim();

  return getNativeMonospaceFontFamily(configuredFontFamily || DEFAULT_MONOSPACE_FONT_FAMILY);
}

export function NativeTerminalSurface({
  focused,
  opacity,
  tabDragInProgress = false,
  terminal,
}: NativeTerminalSurfaceProps) {
  const { resolvedTheme } = useTheme();
  const ownerRef = useRef(Symbol("native-terminal-surface-owner"));
  const hostRef = useRef<HTMLDivElement | null>(null);
  const lifecycleTokenRef = useRef(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeFrameCoordinatorRef = useRef<NativeTerminalSurfaceSyncCoordinator | null>(null);
  const shellResizeInProgressRef = useRef(false);
  const syncResizeFrameRef = useRef<() => Promise<void>>(async () => {});
  const syncCoordinatorRef = useRef<NativeTerminalSurfaceSyncCoordinator | null>(null);
  const syncSurfaceRef = useRef<() => Promise<void>>(async () => {});
  const [attachState, setAttachState] = useState<NativeTerminalSurfaceAttachState>(() =>
    terminalHasLiveSession(terminal.status) ? "attaching" : "attached",
  );
  const [error, setError] = useState<string | null>(null);
  const hasLiveSession = terminalHasLiveSession(terminal.status);

  const getSyncCoordinator = (): NativeTerminalSurfaceSyncCoordinator => {
    if (syncCoordinatorRef.current) {
      return syncCoordinatorRef.current;
    }

    syncCoordinatorRef.current = createNativeTerminalSurfaceSyncCoordinator({
      cancelFrame: window.cancelAnimationFrame,
      requestFrame: window.requestAnimationFrame,
      sync: () => syncSurfaceRef.current(),
    });
    return syncCoordinatorRef.current;
  };

  const getResizeFrameCoordinator = (): NativeTerminalSurfaceSyncCoordinator => {
    if (resizeFrameCoordinatorRef.current) {
      return resizeFrameCoordinatorRef.current;
    }

    resizeFrameCoordinatorRef.current = createNativeTerminalSurfaceSyncCoordinator({
      cancelFrame: window.cancelAnimationFrame,
      requestFrame: window.requestAnimationFrame,
      sync: () => syncResizeFrameRef.current(),
    });
    return resizeFrameCoordinatorRef.current;
  };

  const hideSurface = async () => {
    try {
      await hideNativeTerminalSurface(terminal.id);
      setAttachState(hasLiveSession ? "attaching" : "attached");
      setError(null);
    } catch (nextError) {
      setAttachState("failed");
      setError(String(nextError));
    }
  };

  const syncSurface = async () => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const lifecycleToken = lifecycleTokenRef.current;
    const rect = host.getBoundingClientRect();
    const visible = shouldShowNativeTerminalSurface({
      hasLiveSession,
      height: rect.height,
      width: rect.width,
    });
    const hiddenForTabDrag = shouldHideNativeTerminalSurfaceForTabDrag({
      hasLiveSession,
      height: rect.height,
      tabDragInProgress,
      width: rect.width,
    });
    if (hiddenForTabDrag) {
      await hideNativeTerminalSurface(terminal.id);
      return;
    }

    if (!visible) {
      setAttachState(hasLiveSession ? "attaching" : "attached");
      await hideSurface();
      return;
    }

    try {
      const interaction = resolveNativeTerminalSurfaceInteraction({
        focused,
        shellResizeInProgress: shellResizeInProgressRef.current,
        visible,
      });
      const terminalTheme = resolveTerminalTheme(host, resolvedTheme);
      const terminalFontFamily = readNativeTerminalMonospaceFontFamily();

      if (
        interaction.focused &&
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body
      ) {
        document.activeElement.blur();
      }

      await measureAsyncPerformance(`native-terminal-sync:${terminal.id}`, () =>
        syncNativeTerminalSurface({
          appearance: themeAppearance(resolvedTheme),
          focused: interaction.focused,
          fontFamily: terminalFontFamily,
          fontSize: DEFAULT_TERMINAL_FONT_SIZE,
          height: rect.height,
          opacity,
          pointerPassthrough: interaction.pointerPassthrough,
          scaleFactor: window.devicePixelRatio,
          terminalId: terminal.id,
          theme: terminalTheme,
          visible: true,
          width: rect.width,
          x: rect.left,
          y: rect.top,
        }),
      );
      const resultAction = resolveNativeTerminalSurfaceSyncResultAction({
        currentLifecycleToken: lifecycleTokenRef.current,
        lifecycleToken,
        registry: nativeTerminalSurfaceLeaseRegistry,
        terminalId: terminal.id,
      });
      if (resultAction === "hide") {
        await hideNativeTerminalSurface(terminal.id);
        return;
      }

      if (resultAction === "ignore") {
        return;
      }

      setAttachState("attached");
      setError(null);
    } catch (nextError) {
      if (
        resolveNativeTerminalSurfaceSyncResultAction({
          currentLifecycleToken: lifecycleTokenRef.current,
          lifecycleToken,
          registry: nativeTerminalSurfaceLeaseRegistry,
          terminalId: terminal.id,
        }) !== "apply"
      ) {
        return;
      }

      setAttachState("failed");
      setError(String(nextError));
    }
  };

  syncSurfaceRef.current = syncSurface;

  const syncResizeFrame = async () => {
    const host = hostRef.current;
    if (!host || !shellResizeInProgressRef.current) {
      return;
    }

    const rect = host.getBoundingClientRect();
    if (
      !shouldShowNativeTerminalSurface({
        hasLiveSession,
        height: rect.height,
        width: rect.width,
      }) ||
      shouldHideNativeTerminalSurfaceForTabDrag({
        hasLiveSession,
        height: rect.height,
        tabDragInProgress,
        width: rect.width,
      })
    ) {
      return;
    }

    try {
      await measureAsyncPerformance(`native-terminal-frame-sync:${terminal.id}`, () =>
        syncNativeTerminalSurfaceFrame({
          height: rect.height,
          terminalId: terminal.id,
          width: rect.width,
          x: rect.left,
          y: rect.top,
        }),
      );
    } catch (nextError) {
      console.error("Failed to sync native terminal frame during pane resize:", nextError);
    }
  };

  syncResizeFrameRef.current = syncResizeFrame;

  useEffect(() => {
    setAttachState(hasLiveSession ? "attaching" : "attached");
    setError(null);
  }, [hasLiveSession, terminal.id]);

  useEffect(() => {
    lifecycleTokenRef.current += 1;

    return () => {
      lifecycleTokenRef.current += 1;
    };
  }, [terminal.id]);

  useEffect(() => {
    claimNativeTerminalSurfaceLease(
      nativeTerminalSurfaceLeaseRegistry,
      terminal.id,
      ownerRef.current,
      window.cancelAnimationFrame,
    );
  }, [terminal.id]);

  useEffect(() => {
    const unsubscribe = subscribeToShellResize((resizing) => {
      shellResizeInProgressRef.current = resizing;
      if (!resizing) {
        getResizeFrameCoordinator().cancelScheduledSync();
      }
      void getSyncCoordinator().flushSync();
    });

    return () => {
      unsubscribe();
    };
  }, [focused, hasLiveSession, opacity, resolvedTheme, tabDragInProgress, terminal.id]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    claimNativeTerminalSurfaceLease(
      nativeTerminalSurfaceLeaseRegistry,
      terminal.id,
      ownerRef.current,
      window.cancelAnimationFrame,
    );
    getSyncCoordinator().scheduleSync();
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = new ResizeObserver(() => {
      if (shellResizeInProgressRef.current) {
        getResizeFrameCoordinator().scheduleSync();
        return;
      }

      getSyncCoordinator().scheduleSync();
    });
    resizeObserverRef.current.observe(hostRef.current);
    const handleSyncRequest = () => {
      if (shellResizeInProgressRef.current) {
        getResizeFrameCoordinator().scheduleSync();
        return;
      }

      getSyncCoordinator().scheduleSync();
    };
    window.addEventListener("resize", handleSyncRequest);
    window.addEventListener("scroll", handleSyncRequest, true);
    document.addEventListener("visibilitychange", handleSyncRequest);

    return () => {
      getResizeFrameCoordinator().cancelScheduledSync();
      getSyncCoordinator().cancelScheduledSync();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      window.removeEventListener("resize", handleSyncRequest);
      window.removeEventListener("scroll", handleSyncRequest, true);
      document.removeEventListener("visibilitychange", handleSyncRequest);
      scheduleNativeTerminalSurfaceLeaseHide(
        nativeTerminalSurfaceLeaseRegistry,
        terminal.id,
        ownerRef.current,
        window.requestAnimationFrame,
        window.cancelAnimationFrame,
        (terminalId) => {
          void hideNativeTerminalSurface(terminalId);
        },
      );
    };
  }, [focused, hasLiveSession, opacity, resolvedTheme, tabDragInProgress, terminal.id]);

  useEffect(() => {
    if (typeof MutationObserver === "undefined") {
      return;
    }

    const scheduleSync = () => {
      if (shellResizeInProgressRef.current) {
        getResizeFrameCoordinator().scheduleSync();
        return;
      }

      getSyncCoordinator().scheduleSync();
    };

    const observer = new MutationObserver(() => {
      scheduleSync();
    });

    const root = document.documentElement;
    const head = document.head;

    observer.observe(root, {
      attributeFilter: ["class", "data-theme", "style"],
      attributes: true,
    });

    if (head) {
      observer.observe(head, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });
    }

    return () => {
      observer.disconnect();
    };
  }, [focused, hasLiveSession, opacity, resolvedTheme, tabDragInProgress, terminal.id]);

  const showAttachOverlay = hasLiveSession && attachState !== "attached" && !tabDragInProgress;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--terminal-surface-background)]">
      {error && (
        <Alert className="border-x-0 border-t-0" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="min-h-0 flex-1 overflow-hidden bg-[var(--terminal-surface-background)]">
        {hasLiveSession ? (
          <div
            className="relative h-full w-full"
            style={{ paddingInline: `${NATIVE_TERMINAL_EDGE_GUTTER_PX}px` }}
          >
            <div ref={hostRef} className="h-full w-full" />
            {showAttachOverlay ? (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                <div className="flex max-w-sm flex-col items-center gap-3">
                  <div className="text-[var(--muted-foreground)] opacity-40">
                    <TerminalSquare />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {attachState === "failed" ? "Terminal unavailable" : "Opening terminal..."}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {attachState === "failed"
                        ? "Lifecycle could not attach the native terminal surface."
                        : "Lifecycle is attaching the native terminal surface."}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState
            className="h-full"
            description="This terminal session is no longer attachable. Start a new session to continue."
            icon={<TerminalSquare />}
            title="Session unavailable"
          />
        )}
      </div>
    </div>
  );
}
