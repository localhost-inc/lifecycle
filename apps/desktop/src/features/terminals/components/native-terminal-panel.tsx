import { useEffect, useRef, useState } from "react";
import {
  hideNativeTerminalSurface,
  syncNativeTerminalSurface,
  terminalHasLiveSession,
  type TerminalRow,
} from "../api";
import { resolveTerminalTheme } from "../terminal-theme";
import { useSettings } from "../../settings/state/app-settings-provider";
import { useTheme } from "../../../theme/theme-provider";

interface NativeTerminalPanelProps {
  active: boolean;
  terminal: TerminalRow;
}

export function NativeTerminalPanel({ active, terminal }: NativeTerminalPanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const frameIdRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { terminalFontSize } = useSettings();
  const { preset, resolvedAppearance } = useTheme();
  const hasLiveSession = terminalHasLiveSession(terminal.status);

  const syncSurface = async () => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const rect = host.getBoundingClientRect();
    const visible = active && hasLiveSession && rect.width > 1 && rect.height > 1;
    if (!visible) {
      try {
        await hideNativeTerminalSurface(terminal.id);
        setError(null);
      } catch (nextError) {
        setError(String(nextError));
      }
      return;
    }

    try {
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
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
    if (frameIdRef.current !== null) {
      return;
    }

    frameIdRef.current = window.requestAnimationFrame(() => {
      frameIdRef.current = null;
      void syncSurface();
    });
  };

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
      if (frameIdRef.current !== null) {
        window.cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("scroll", scheduleSync, true);
      document.removeEventListener("visibilitychange", scheduleSync);
      void hideNativeTerminalSurface(terminal.id);
    };
  }, [active, hasLiveSession, preset, resolvedAppearance, terminal.id, terminalFontSize]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--terminal-surface-background)]">
      {error && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {hasLiveSession ? (
          <div
            ref={hostRef}
            className="h-full w-full bg-[var(--terminal-surface-background)]"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <div>
              <h3 className="text-lg font-semibold text-[var(--foreground)]">
                Session unavailable
              </h3>
              <p className="mt-2 max-w-md text-sm text-[var(--muted-foreground)]">
                This terminal session is no longer attachable. Start a new shell or harness session
                to continue.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
