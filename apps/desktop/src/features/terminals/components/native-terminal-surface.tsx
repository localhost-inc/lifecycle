import { Alert, AlertDescription, EmptyState, useTheme } from "@lifecycle/ui";
import { TerminalSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { subscribeToShellResize } from "../../../components/layout/shell-resize-provider";
import {
  hideNativeTerminalSurface,
  syncNativeTerminalSurface,
  terminalHasLiveSession,
  type TerminalRow,
} from "../api";
import { resolveTerminalTheme } from "../terminal-theme";
import { useSettings } from "../../settings/state/app-settings-provider";

interface NativeTerminalSurfaceProps {
  active: boolean;
  terminal: TerminalRow;
}

// DOM splitters cannot stack above the sibling native NSView, so keep the
// embedded surface slightly inset from the shell seams.
const NATIVE_TERMINAL_EDGE_GUTTER_PX = 6;

export function shouldShowNativeTerminalSurface({
  active,
  hasLiveSession,
  height,
  width,
}: {
  active: boolean;
  hasLiveSession: boolean;
  height: number;
  width: number;
}): boolean {
  return active && hasLiveSession && width > 1 && height > 1;
}

export function resolveNativeTerminalSurfaceInteraction({
  shellResizeInProgress,
  visible,
}: {
  shellResizeInProgress: boolean;
  visible: boolean;
}): { focused: boolean; pointerPassthrough: boolean } {
  return {
    focused: visible && !shellResizeInProgress,
    pointerPassthrough: shellResizeInProgress,
  };
}

export function NativeTerminalSurface({ active, terminal }: NativeTerminalSurfaceProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const frameIdRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const shellResizeInProgressRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { terminalFontSize } = useSettings();
  const { preset, resolvedAppearance } = useTheme();
  const hasLiveSession = terminalHasLiveSession(terminal.status);

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
      setError(null);
    } catch (nextError) {
      setError(String(nextError));
    }
  };

  const syncSurface = async () => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const rect = host.getBoundingClientRect();
    const visible = shouldShowNativeTerminalSurface({
      active,
      hasLiveSession,
      height: rect.height,
      width: rect.width,
    });
    if (!visible) {
      await hideSurface();
      return;
    }

    try {
      const interaction = resolveNativeTerminalSurfaceInteraction({
        shellResizeInProgress: shellResizeInProgressRef.current,
        visible,
      });

      if (
        interaction.focused &&
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body
      ) {
        document.activeElement.blur();
      }
      await syncNativeTerminalSurface({
        appearance: resolvedAppearance,
        focused: interaction.focused,
        fontSize: terminalFontSize,
        height: rect.height,
        pointerPassthrough: interaction.pointerPassthrough,
        scaleFactor: window.devicePixelRatio,
        terminalId: terminal.id,
        theme: resolveTerminalTheme(host, preset, resolvedAppearance).nativeTheme,
        visible: true,
        width: rect.width,
        x: rect.left,
        y: rect.top,
      });
      setError(null);
    } catch (nextError) {
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
    const unsubscribe = subscribeToShellResize((resizing) => {
      shellResizeInProgressRef.current = resizing;
      cancelScheduledSync();
      void syncSurface();
    });

    return () => {
      unsubscribe();
    };
  }, [active, hasLiveSession, preset, resolvedAppearance, terminal.id, terminalFontSize]);

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
      void hideSurface();
    };
  }, [active, hasLiveSession, preset, resolvedAppearance, terminal.id, terminalFontSize]);

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
            className="h-full w-full"
            style={{ paddingInline: `${NATIVE_TERMINAL_EDGE_GUTTER_PX}px` }}
          >
            <div ref={hostRef} className="h-full w-full bg-[var(--terminal-surface-background)]" />
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
