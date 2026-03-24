import { isTauri } from "@tauri-apps/api/core";
import type { DataStoreIdentifier } from "@tauri-apps/api/app";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Webview } from "@tauri-apps/api/webview";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Alert, AlertDescription, Button } from "@lifecycle/ui";
import { AlertTriangle, ExternalLink, Globe, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BROWSER_DATA_STORE_IDENTIFIER: DataStoreIdentifier = [
  98, 114, 111, 119, 115, 101, 114, 45, 99, 97, 110, 118, 97, 115, 45, 49,
];

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return navigator.userAgent.includes("Mac") || navigator.userAgent.includes("iPhone");
}

function sanitizeWebviewLabel(value: string): string {
  return value.replace(/[^a-zA-Z0-9\-/:_]/g, "_");
}

export function browserWebviewLabel(tabKey: string): string {
  return sanitizeWebviewLabel(`browser-view:${tabKey}`);
}

async function createBrowserWebview(label: string, url: string): Promise<Webview> {
  return await new Promise((resolve, reject) => {
    const webview = new Webview(getCurrentWindow(), label, {
      acceptFirstMouse: true,
      backgroundColor: "#111111",
      dataDirectory: "browser-canvas",
      ...(isMacPlatform() ? { dataStoreIdentifier: BROWSER_DATA_STORE_IDENTIFIER } : {}),
      dragDropEnabled: false,
      focus: false,
      height: 160,
      url,
      width: 160,
      x: 0,
      y: 0,
    });

    void webview.once("tauri://created", () => resolve(webview));
    void webview.once("tauri://error", (event) => {
      reject(
        new Error(
          typeof event.payload === "string" && event.payload.length > 0
            ? event.payload
            : "Lifecycle could not create the browser surface.",
        ),
      );
    });
  });
}

export async function closeBrowserWebview(tabKey: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  const existing = await Webview.getByLabel(browserWebviewLabel(tabKey));
  if (existing) {
    await existing.close();
  }
}

interface BrowserSurfaceProps {
  tabKey: string;
  title: string;
  url: string;
}

export function BrowserSurface({ tabKey, title, url }: BrowserSurfaceProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const lastBoundsKeyRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const webviewLabel = useMemo(() => browserWebviewLabel(tabKey), [tabKey]);

  const openExternal = useCallback(() => {
    void openUrl(url);
  }, [url]);

  useEffect(() => {
    if (!isTauri() || typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    let browserWebview: Webview | null = null;
    let frameId: number | null = null;
    let syncInFlight = false;
    let syncRequested = false;

    const syncBounds = async () => {
      if (cancelled || !browserWebview) {
        return;
      }

      const frame = frameRef.current;
      if (!frame) {
        return;
      }

      const rect = frame.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        lastBoundsKeyRef.current = null;
        await browserWebview.hide().catch(() => undefined);
        return;
      }

      const nextBoundsKey = [
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height),
      ].join(":");

      if (lastBoundsKeyRef.current !== nextBoundsKey) {
        lastBoundsKeyRef.current = nextBoundsKey;
        await browserWebview
          .setPosition(new LogicalPosition(rect.left, rect.top))
          .catch(() => undefined);
        await browserWebview
          .setSize(new LogicalSize(rect.width, rect.height))
          .catch(() => undefined);
      }

      await browserWebview.show().catch(() => undefined);
    };

    const scheduleSync = () => {
      if (cancelled) {
        return;
      }

      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        if (syncInFlight) {
          syncRequested = true;
          return;
        }

        syncInFlight = true;
        void syncBounds().finally(() => {
          syncInFlight = false;
          if (syncRequested) {
            syncRequested = false;
            scheduleSync();
          }
        });
      });
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            scheduleSync();
          });

    const attachBrowser = async () => {
      const existingWebview = await Webview.getByLabel(webviewLabel);
      if (existingWebview) {
        await existingWebview.close().catch(() => undefined);
      }

      const nextBrowserWebview = await createBrowserWebview(webviewLabel, url);

      if (cancelled) {
        await nextBrowserWebview.close().catch(() => undefined);
        return;
      }

      browserWebview = nextBrowserWebview;
      setError(null);
      scheduleSync();
    };

    void attachBrowser().catch((nextError) => {
      if (cancelled) {
        return;
      }

      setError(
        nextError instanceof Error
          ? nextError.message
          : "Lifecycle could not open the browser surface.",
      );
    });

    if (frameRef.current && resizeObserver) {
      resizeObserver.observe(frameRef.current);
    }

    window.addEventListener("resize", scheduleSync);

    return () => {
      cancelled = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleSync);
      if (browserWebview) {
        void browserWebview.close().catch(() => undefined);
      }
    };
  }, [reloadNonce, url, webviewLabel]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-[var(--background)]"
      data-slot="browser-surface"
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]">
          <Globe className="size-4" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-[var(--foreground)]">{title}</div>
          <div className="truncate text-[11px] text-[var(--muted-foreground)]">{url}</div>
        </div>
        <Button
          aria-label="Reload browser"
          onClick={() => {
            setReloadNonce((current) => current + 1);
          }}
          size="icon"
          variant="ghost"
        >
          <RefreshCw className="size-4" strokeWidth={1.8} />
        </Button>
        <Button aria-label="Open in browser" onClick={openExternal} size="icon" variant="ghost">
          <ExternalLink className="size-4" strokeWidth={1.8} />
        </Button>
      </div>

      {error ? (
        <div className="p-3">
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        {isTauri() ? (
          <div
            ref={frameRef}
            className="h-full w-full bg-[var(--background)]"
            data-browser-host={webviewLabel}
          />
        ) : (
          <iframe
            className="h-full w-full border-0 bg-[var(--background)]"
            src={url}
            title={title}
          />
        )}
      </div>
    </div>
  );
}
