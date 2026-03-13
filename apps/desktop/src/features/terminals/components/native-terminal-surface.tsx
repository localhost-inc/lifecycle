import type { TerminalRecord } from "@lifecycle/contracts";
import {
  Alert,
  AlertDescription,
  EmptyState,
  DEFAULT_THEME_PREFERENCE,
  getSystemThemeAppearance,
  isTheme,
  resolveTheme,
  themeAppearance,
  type ResolvedTheme,
} from "@lifecycle/ui";
import { TerminalSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { subscribeToShellResize } from "../../../components/layout/shell-resize-provider";
import { measureAsyncPerformance } from "../../../lib/performance";
import {
  DEFAULT_MONOSPACE_FONT_FAMILY,
  getNativeMonospaceFontFamily,
} from "../../../lib/typography";
import {
  hideNativeTerminalSurface,
  syncNativeTerminalSurface,
  terminalHasLiveSession,
} from "../api";
import { DEFAULT_TERMINAL_FONT_SIZE } from "../terminal-display";
import { resolveTerminalTheme } from "../terminal-theme";

interface NativeTerminalSurfaceProps {
  focused: boolean;
  tabDragInProgress?: boolean;
  terminal: TerminalRecord;
}

type NativeTerminalSurfaceAttachState = "attached" | "attaching" | "failed";

interface NativeTerminalSurfaceLease {
  owner: symbol;
  pendingHideFrameId: number | null;
}

type NativeTerminalSurfaceSyncResultAction = "apply" | "hide" | "ignore";

// DOM splitters cannot stack above the sibling native NSView, so keep the
// embedded surface slightly inset from the shell seams.
const NATIVE_TERMINAL_EDGE_GUTTER_PX = 6;
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

export function resolveNativeTerminalSurfaceInteraction({
  focused,
  shellResizeInProgress,
  tabDragInProgress,
  visible,
}: {
  focused: boolean;
  shellResizeInProgress: boolean;
  tabDragInProgress: boolean;
  visible: boolean;
}): { focused: boolean; pointerPassthrough: boolean } {
  return {
    focused: visible && focused && !shellResizeInProgress && !tabDragInProgress,
    pointerPassthrough: shellResizeInProgress || tabDragInProgress || !focused,
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

function readNativeTerminalResolvedTheme(): ResolvedTheme {
  if (typeof document === "undefined") {
    return resolveTheme(DEFAULT_THEME_PREFERENCE.theme, getSystemThemeAppearance(null));
  }

  const rootTheme = document.documentElement.dataset.theme;
  if (isTheme(rootTheme) && rootTheme !== "system") {
    return rootTheme;
  }

  return resolveTheme(DEFAULT_THEME_PREFERENCE.theme, getSystemThemeAppearance());
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
  tabDragInProgress = false,
  terminal,
}: NativeTerminalSurfaceProps) {
  const ownerRef = useRef(Symbol("native-terminal-surface-owner"));
  const hostRef = useRef<HTMLDivElement | null>(null);
  const frameIdRef = useRef<number | null>(null);
  const lifecycleTokenRef = useRef(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const shellResizeInProgressRef = useRef(false);
  const [attachState, setAttachState] = useState<NativeTerminalSurfaceAttachState>(() =>
    terminalHasLiveSession(terminal.status) ? "attaching" : "attached",
  );
  const [error, setError] = useState<string | null>(null);
  const hasLiveSession = terminalHasLiveSession(terminal.status);
  const resolvedTheme = readNativeTerminalResolvedTheme();
  const terminalFontFamily = readNativeTerminalMonospaceFontFamily();

  const cancelScheduledSync = () => {
    if (frameIdRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(frameIdRef.current);
    frameIdRef.current = null;
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
    if (!visible) {
      setAttachState(hasLiveSession ? "attaching" : "attached");
      await hideSurface();
      return;
    }

    try {
      const interaction = resolveNativeTerminalSurfaceInteraction({
        focused,
        shellResizeInProgress: shellResizeInProgressRef.current,
        tabDragInProgress,
        visible,
      });

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
          pointerPassthrough: interaction.pointerPassthrough,
          scaleFactor: window.devicePixelRatio,
          terminalId: terminal.id,
          theme: resolveTerminalTheme(host, resolvedTheme),
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

  const scheduleSync = () => {
    if (frameIdRef.current !== null) {
      return;
    }

    frameIdRef.current = window.requestAnimationFrame(() => {
      frameIdRef.current = null;
      void syncSurface();
    });
  };

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
      cancelScheduledSync();
      void syncSurface();
    });

    return () => {
      unsubscribe();
    };
  }, [focused, hasLiveSession, resolvedTheme, tabDragInProgress, terminal.id, terminalFontFamily]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    scheduleSync();
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = new ResizeObserver(() => {
      scheduleSync();
    });
    resizeObserverRef.current.observe(hostRef.current);
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("scroll", scheduleSync, true);
    document.addEventListener("visibilitychange", scheduleSync);

    return () => {
      cancelScheduledSync();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("scroll", scheduleSync, true);
      document.removeEventListener("visibilitychange", scheduleSync);
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
  }, [focused, hasLiveSession, resolvedTheme, tabDragInProgress, terminal.id, terminalFontFamily]);

  const showAttachOverlay = hasLiveSession && attachState !== "attached";

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
            <div ref={hostRef} className="h-full w-full bg-[var(--terminal-surface-background)]" />
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
