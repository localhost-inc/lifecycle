import { isTauri } from "@tauri-apps/api/core";
import { emitTo, type EventTarget } from "@tauri-apps/api/event";
import { LogicalPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { Webview, getCurrentWebview } from "@tauri-apps/api/webview";
import type {
  HostedOverlayAction,
  HostedOverlayAnchorUpdate,
  HostedOverlayCloseRequest,
  HostedOverlayPayload,
  HostedOverlayReadyEvent,
  HostedOverlayStatusRequest,
} from "./overlay-contract";
import { logOverlayDebug } from "./overlay-debug";
import { buildOverlayHostUrl } from "./overlay-host-url";

export const OVERLAY_HOST_LABEL = "desktop-overlay-host";
export const OVERLAY_HOST_PATH = "/overlay-host";

export const OVERLAY_HOST_READY_EVENT = "desktop-overlay:ready";
export const OVERLAY_HOST_STATUS_REQUEST_EVENT = "desktop-overlay:status-request";
export const OVERLAY_HOST_PRESENT_EVENT = "desktop-overlay:present";
export const OVERLAY_HOST_ANCHOR_EVENT = "desktop-overlay:anchor";
export const OVERLAY_HOST_CLOSE_EVENT = "desktop-overlay:close";
export const OVERLAY_HOST_ACTION_EVENT = "desktop-overlay:action";
export const OVERLAY_HOST_REQUEST_CLOSE_EVENT = "desktop-overlay:request-close";

type OverlayActionHandler = (action: HostedOverlayAction) => void;

let hostPromise: Promise<Webview> | null = null;
let initPromise: Promise<void> | null = null;
let listenersInstalled = false;
let hostReady = false;

const readinessSubscribers = new Set<() => void>();
const overlayActionHandlers = new Map<string, OverlayActionHandler>();
const overlayCloseHandlers = new Map<string, () => void>();

function overlayHostTarget(): EventTarget {
  return { kind: "Webview", label: OVERLAY_HOST_LABEL };
}

function setHostReady(nextReady: boolean): void {
  if (hostReady === nextReady) {
    return;
  }

  logOverlayDebug("owner:host-ready", { nextReady });
  hostReady = nextReady;
  for (const subscriber of readinessSubscribers) {
    subscriber();
  }
}

export function isOverlayHostWindow(): boolean {
  return typeof window !== "undefined" && window.location.pathname === OVERLAY_HOST_PATH;
}

export function subscribeOverlayHostReady(callback: () => void): () => void {
  readinessSubscribers.add(callback);
  return () => {
    readinessSubscribers.delete(callback);
  };
}

export function getOverlayHostReady(): boolean {
  return hostReady;
}

function currentOwnerWindowLabel(): string | null {
  if (!isTauri() || isOverlayHostWindow()) {
    return null;
  }

  return getCurrentWebview().label;
}

async function installMainWindowListeners(): Promise<void> {
  if (listenersInstalled || !isTauri() || isOverlayHostWindow()) {
    return;
  }

  listenersInstalled = true;
  const currentWindow = getCurrentWindow();
  const currentWebview = getCurrentWebview();
  logOverlayDebug("owner:listeners-install", {
    windowLabel: currentWindow.label,
    webviewLabel: currentWebview.label,
  });

  await currentWebview.listen<HostedOverlayReadyEvent>(OVERLAY_HOST_READY_EVENT, ({ payload }) => {
    logOverlayDebug("owner:ready-received", payload);
    if (payload.hostWindowLabel === OVERLAY_HOST_LABEL) {
      setHostReady(true);
    }
  });

  await currentWebview.listen<HostedOverlayAction>(OVERLAY_HOST_ACTION_EVENT, ({ payload }) => {
    logOverlayDebug("owner:action-received", payload);
    if (payload.ownerWindowLabel !== currentWebview.label) {
      return;
    }

    overlayActionHandlers.get(payload.overlayId)?.(payload);
  });

  await currentWebview.listen<HostedOverlayCloseRequest>(
    OVERLAY_HOST_REQUEST_CLOSE_EVENT,
    ({ payload }) => {
      logOverlayDebug("owner:request-close-received", payload);
      if (payload.ownerWindowLabel !== currentWebview.label) {
        return;
      }

      overlayCloseHandlers.get(payload.overlayId)?.();
    },
  );

  await currentWindow.onResized(() => {
    void syncOverlayHostViewport().catch((error) => {
      console.error("Failed to sync overlay host after resize:", error);
    });
  });

  await currentWindow.onScaleChanged(() => {
    void syncOverlayHostViewport().catch((error) => {
      console.error("Failed to sync overlay host after scale change:", error);
    });
  });
}

async function configureOverlayHostWebview(hostWebview: Webview): Promise<void> {
  await Promise.allSettled([
    hostWebview.setAutoResize(true),
    hostWebview.setBackgroundColor({ alpha: 0, blue: 0, green: 0, red: 0 }),
    hostWebview.hide(),
  ]);
}

async function waitForWebviewCreation(hostWebview: Webview): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      logOverlayDebug("owner:host-create-timeout", { hostWebviewLabel: hostWebview.label });
      reject(new Error("Timed out creating overlay host webview."));
    }, 10000);

    void hostWebview.once("tauri://created", () => {
      window.clearTimeout(timeout);
      logOverlayDebug("owner:host-created", { hostWebviewLabel: hostWebview.label });
      resolve();
    });

    void hostWebview.once("tauri://error", (event) => {
      window.clearTimeout(timeout);
      logOverlayDebug("owner:host-create-error", {
        hostWebviewLabel: hostWebview.label,
        payload: event.payload,
      });
      reject(new Error(String(event.payload ?? "Failed to create overlay host webview.")));
    });
  });
}

async function ensureOverlayHostWebview(): Promise<Webview> {
  if (hostPromise) {
    return hostPromise;
  }

  hostPromise = (async () => {
    const existing = await Webview.getByLabel(OVERLAY_HOST_LABEL);
    if (existing) {
      logOverlayDebug("owner:host-reused", { hostWebviewLabel: existing.label });
      await configureOverlayHostWebview(existing);
      return existing;
    }

    const ownerWindow = getCurrentWindow();
    const ownerWebview = getCurrentWebview();
    logOverlayDebug("owner:host-create", {
      hostWebviewLabel: OVERLAY_HOST_LABEL,
      ownerWebviewLabel: ownerWebview.label,
      ownerWindowLabel: ownerWindow.label,
      url: buildOverlayHostUrl(ownerWebview.label, window.location.origin),
    });
    const hostWebview = new Webview(ownerWindow, OVERLAY_HOST_LABEL, {
      acceptFirstMouse: true,
      focus: false,
      height: 1,
      transparent: true,
      url: buildOverlayHostUrl(ownerWebview.label, window.location.origin),
      width: 1,
      x: 0,
      y: 0,
    });

    await waitForWebviewCreation(hostWebview);
    await configureOverlayHostWebview(hostWebview);
    return hostWebview;
  })().catch((error) => {
    hostPromise = null;
    throw error;
  });

  return hostPromise;
}

export async function syncOverlayHostViewport(): Promise<void> {
  if (!isTauri() || isOverlayHostWindow()) {
    return;
  }

  const hostWebview = await ensureOverlayHostWebview();
  const ownerWindow = getCurrentWindow();
  const [size, scaleFactor] = await Promise.all([ownerWindow.innerSize(), ownerWindow.scaleFactor()]);

  await Promise.all([
    hostWebview.setPosition(new LogicalPosition(0, 0)),
    hostWebview.setSize(size),
    hostWebview.setAutoResize(true),
  ]);
  logOverlayDebug("owner:viewport-synced", {
    height: size.height / scaleFactor,
    hostWebviewLabel: hostWebview.label,
    width: size.width / scaleFactor,
    x: 0,
    y: 0,
  });
}

async function requestOverlayHostReady(): Promise<void> {
  const ownerWindowLabel = currentOwnerWindowLabel();
  if (!ownerWindowLabel) {
    return;
  }

  await ensureOverlayHostWebview();
  logOverlayDebug("owner:ready-requested", { ownerWindowLabel });
  await emitTo<HostedOverlayStatusRequest>(overlayHostTarget(), OVERLAY_HOST_STATUS_REQUEST_EVENT, {
    ownerWindowLabel,
  });
}

async function waitForOverlayHostReady(): Promise<void> {
  if (hostReady) {
    return;
  }

  logOverlayDebug("owner:ready-wait-start");
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let intervalId = 0;
    let timeoutId = 0;

    const cleanup = () => {
      settled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
      unsubscribe();
    };

    const unsubscribe = subscribeOverlayHostReady(() => {
      if (!hostReady || settled) {
        return;
      }

      cleanup();
      resolve();
    });

    intervalId = window.setInterval(() => {
      void requestOverlayHostReady().catch((error) => {
        console.error("Failed to request overlay host ready status:", error);
      });
    }, 100);

    timeoutId = window.setTimeout(() => {
      if (settled) {
        return;
      }

      cleanup();
      logOverlayDebug("owner:ready-wait-timeout");
      reject(new Error("Timed out waiting for the desktop overlay host to become ready."));
    }, 10000);

    void requestOverlayHostReady().catch((error) => {
      cleanup();
      reject(error);
    });
  });
}

export async function initializeDesktopOverlayHost(): Promise<void> {
  if (!isTauri() || isOverlayHostWindow()) {
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    logOverlayDebug("owner:init-start");
    await installMainWindowListeners();
    await ensureOverlayHostWebview();
    await syncOverlayHostViewport();
    await waitForOverlayHostReady();
    logOverlayDebug("owner:init-complete");
  })().catch((error) => {
    initPromise = null;
    setHostReady(false);
    logOverlayDebug("owner:init-error", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  });

  return initPromise;
}

export async function presentHostedOverlay(payload: HostedOverlayPayload): Promise<void> {
  if (!isTauri() || isOverlayHostWindow()) {
    return;
  }

  await initializeDesktopOverlayHost();
  await syncOverlayHostViewport();
  await ensureOverlayHostWebview();
  logOverlayDebug("owner:present", {
    kind: payload.kind,
    overlayId: payload.overlayId,
    ownerWindowLabel: payload.ownerWindowLabel,
  });
  await emitTo(overlayHostTarget(), OVERLAY_HOST_PRESENT_EVENT, payload);
}

export async function updateHostedOverlayAnchor(payload: HostedOverlayAnchorUpdate): Promise<void> {
  if (!isTauri() || isOverlayHostWindow() || !getOverlayHostReady()) {
    return;
  }

  await ensureOverlayHostWebview();
  logOverlayDebug("owner:anchor-update", {
    overlayId: payload.overlayId,
    ownerWindowLabel: payload.ownerWindowLabel,
  });
  await emitTo(overlayHostTarget(), OVERLAY_HOST_ANCHOR_EVENT, payload);
}

export async function closeHostedOverlay(payload: HostedOverlayCloseRequest): Promise<void> {
  if (!isTauri() || isOverlayHostWindow() || !getOverlayHostReady()) {
    return;
  }

  await ensureOverlayHostWebview();
  logOverlayDebug("owner:close", payload);
  await emitTo(overlayHostTarget(), OVERLAY_HOST_CLOSE_EVENT, payload);
}

export function registerHostedOverlayActionHandler(
  overlayId: string,
  handler: OverlayActionHandler,
): () => void {
  overlayActionHandlers.set(overlayId, handler);
  return () => {
    if (overlayActionHandlers.get(overlayId) === handler) {
      overlayActionHandlers.delete(overlayId);
    }
  };
}

export function registerHostedOverlayCloseHandler(
  overlayId: string,
  handler: () => void,
): () => void {
  overlayCloseHandlers.set(overlayId, handler);
  return () => {
    if (overlayCloseHandlers.get(overlayId) === handler) {
      overlayCloseHandlers.delete(overlayId);
    }
  };
}
