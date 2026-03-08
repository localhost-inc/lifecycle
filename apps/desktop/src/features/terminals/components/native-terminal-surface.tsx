import { Alert, AlertDescription, EmptyState, useTheme } from "@lifecycle/ui";
import { TerminalSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  subscribeToShellResize,
  useShellResizeInProgress,
} from "../../../components/layout/shell-resize-provider";
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

const NATIVE_TERMINAL_RESUME_DELAY_MS = 120;

export function shouldShowNativeTerminalSurface({
  active,
  hasLiveSession,
  isShellResizeInProgress,
  height,
  width,
}: {
  active: boolean;
  hasLiveSession: boolean;
  isShellResizeInProgress: boolean;
  height: number;
  width: number;
}): boolean {
  return active && hasLiveSession && !isShellResizeInProgress && width > 1 && height > 1;
}

export function NativeTerminalSurface({ active, terminal }: NativeTerminalSurfaceProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const frameIdRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resumeTimeoutRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { terminalFontSize } = useSettings();
  const { preset, resolvedAppearance } = useTheme();
  const hasLiveSession = terminalHasLiveSession(terminal.status);
  const isShellResizeInProgress = useShellResizeInProgress();
  const shellResizeHoldRef = useRef(isShellResizeInProgress);

  const cancelScheduledSync = () => {
    if (frameIdRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(frameIdRef.current);
    frameIdRef.current = null;
  };

  const clearResumeTimeout = () => {
    if (resumeTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = null;
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
    const shellResizeBlocked = shellResizeHoldRef.current || isShellResizeInProgress;
    const visible = shouldShowNativeTerminalSurface({
      active,
      hasLiveSession,
      height: rect.height,
      isShellResizeInProgress: shellResizeBlocked,
      width: rect.width,
    });
    if (!visible) {
      await hideSurface();
      return;
    }

    try {
      if (
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body
      ) {
        document.activeElement.blur();
      }
      await syncNativeTerminalSurface({
        appearance: resolvedAppearance,
        focused: visible,
        fontSize: terminalFontSize,
        height: rect.height,
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
    if (shellResizeHoldRef.current || isShellResizeInProgress) {
      cancelScheduledSync();
      return;
    }

    if (frameIdRef.current !== null) {
      return;
    }

    frameIdRef.current = window.requestAnimationFrame(() => {
      frameIdRef.current = null;
      void syncSurface();
    });
  };

  useEffect(() => {
    if (!isShellResizeInProgress) {
      return;
    }

    shellResizeHoldRef.current = true;
    clearResumeTimeout();
    cancelScheduledSync();
    void hideSurface();
  }, [isShellResizeInProgress, terminal.id]);

  useEffect(() => {
    const unsubscribe = subscribeToShellResize((resizing) => {
      if (resizing) {
        shellResizeHoldRef.current = true;
        clearResumeTimeout();
        cancelScheduledSync();
        void hideSurface();
        return;
      }

      if (!shellResizeHoldRef.current) {
        return;
      }

      clearResumeTimeout();
      resumeTimeoutRef.current = window.setTimeout(() => {
        resumeTimeoutRef.current = null;
        shellResizeHoldRef.current = false;
        scheduleSync();
      }, NATIVE_TERMINAL_RESUME_DELAY_MS);
    });

    return () => {
      unsubscribe();
      clearResumeTimeout();
    };
  }, [scheduleSync, terminal.id]);

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
      clearResumeTimeout();
      cancelScheduledSync();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("scroll", scheduleSync, true);
      document.removeEventListener("visibilitychange", scheduleSync);
      void hideSurface();
    };
  }, [
    active,
    hasLiveSession,
    isShellResizeInProgress,
    preset,
    resolvedAppearance,
    terminal.id,
    terminalFontSize,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--terminal-surface-background)]">
      {error && (
        <Alert className="border-x-0 border-t-0" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {hasLiveSession ? (
          <div ref={hostRef} className="h-full w-full bg-[var(--terminal-surface-background)]" />
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
