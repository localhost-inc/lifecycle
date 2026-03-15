import { invoke, isTauri } from "@tauri-apps/api/core";
import type { EventTarget } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useMemo, useRef, useState } from "react";
import { applyThemeToRoot } from "@lifecycle/ui";
import {
  SHORTCUT_HANDLER_PRIORITY,
  useShortcutRegistration,
} from "../../../app/shortcuts/shortcut-router";
import { GitActionMenuContent } from "../../git/components/git-action-button";
import { WorkspaceOpenInMenu } from "../../workspaces/components/workspace-open-in-menu";
import type {
  HostedGitActionsOverlay,
  HostedOverlayAction,
  HostedOverlayAnchorUpdate,
  HostedOverlayCloseRequest,
  HostedOverlayPayload,
  HostedOverlayReadyEvent,
  HostedOverlayStatusRequest,
} from "../overlay-contract";
import { logOverlayDebug } from "../overlay-debug";
import { computeHostedOverlayFrame } from "../overlay-frame";
import { readOverlayHostOwnerWindowLabel } from "../overlay-host-url";
import { useOverlayViewport } from "../overlay-viewport";
import {
  OVERLAY_HOST_ACTION_EVENT,
  OVERLAY_HOST_ANCHOR_EVENT,
  OVERLAY_HOST_CLOSE_EVENT,
  OVERLAY_HOST_LABEL,
  OVERLAY_HOST_PRESENT_EVENT,
  OVERLAY_HOST_READY_EVENT,
  OVERLAY_HOST_REQUEST_CLOSE_EVENT,
  OVERLAY_HOST_STATUS_REQUEST_EVENT,
} from "../overlay-window";

function webviewWindowTarget(label: string): EventTarget {
  return { kind: "WebviewWindow", label };
}

export function OverlayHostRoute() {
  const [overlay, setOverlay] = useState<HostedOverlayPayload | null>(null);
  const [draftCommitMessage, setDraftCommitMessage] = useState("");
  const draftOverlayIdRef = useRef<string | null>(null);
  const viewport = useOverlayViewport();
  const ownerWindowLabel = useMemo(
    () => readOverlayHostOwnerWindowLabel(window.location.search),
    [],
  );

  useEffect(() => {
    document.documentElement.dataset.overlayHostWindow = "true";
    document.body.dataset.overlayHostWindow = "true";
    logOverlayDebug("host:route-mounted", {
      ownerWindowLabel,
      search: window.location.search,
    });

    return () => {
      logOverlayDebug("host:route-unmounted");
      delete document.documentElement.dataset.overlayHostWindow;
      delete document.body.dataset.overlayHostWindow;
    };
  }, [ownerWindowLabel]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const currentWindow = getCurrentWindow();
    const currentWebview = getCurrentWebviewWindow();

    const emitReady = async (ownerWindowLabel: string) => {
      logOverlayDebug("host:ready-emitted", { ownerWindowLabel });
      await currentWebview.emitTo<HostedOverlayReadyEvent>(
        webviewWindowTarget(ownerWindowLabel),
        OVERLAY_HOST_READY_EVENT,
        {
          hostWindowLabel: OVERLAY_HOST_LABEL,
        },
      );
    };

    let disposed = false;
    let unlistenPresent: (() => void) | null = null;
    let unlistenAnchor: (() => void) | null = null;
    let unlistenClose: (() => void) | null = null;
    let unlistenStatus: (() => void) | null = null;

    void (async () => {
      try {
        await invoke("set_window_accepts_mouse_moved_events", {
          enabled: true,
        }).catch((error) => {
          console.warn("Failed to enable mouse-moved events on overlay host window:", error);
        });
        const [nextPresent, nextAnchor, nextClose, nextStatus] = await Promise.all([
          currentWebview.listen<HostedOverlayPayload>(OVERLAY_HOST_PRESENT_EVENT, ({ payload }) => {
            logOverlayDebug("host:present-received", {
              kind: payload.kind,
              overlayId: payload.overlayId,
              ownerWindowLabel: payload.ownerWindowLabel,
            });
            setOverlay(payload);
          }),
          currentWebview.listen<HostedOverlayAnchorUpdate>(
            OVERLAY_HOST_ANCHOR_EVENT,
            ({ payload }) => {
              logOverlayDebug("host:anchor-received", {
                overlayId: payload.overlayId,
                ownerWindowLabel: payload.ownerWindowLabel,
              });
              setOverlay((current) => {
                if (!current || current.overlayId !== payload.overlayId) {
                  return current;
                }

                return {
                  ...current,
                  anchor: payload.anchor,
                };
              });
            },
          ),
          currentWebview.listen<HostedOverlayCloseRequest>(
            OVERLAY_HOST_CLOSE_EVENT,
            ({ payload }) => {
              logOverlayDebug("host:close-received", payload);
              setOverlay((current) => {
                if (!current || current.overlayId !== payload.overlayId) {
                  return current;
                }

                return null;
              });
            },
          ),
          currentWebview.listen<HostedOverlayStatusRequest>(
            OVERLAY_HOST_STATUS_REQUEST_EVENT,
            ({ payload }) => {
              logOverlayDebug("host:status-request-received", payload);
              void emitReady(payload.ownerWindowLabel).catch((error) => {
                console.error("Failed to emit overlay host ready event:", error);
              });
            },
          ),
        ]);

        if (disposed) {
          nextPresent();
          nextAnchor();
          nextClose();
          nextStatus();
          return;
        }

        unlistenPresent = nextPresent;
        unlistenAnchor = nextAnchor;
        unlistenClose = nextClose;
        unlistenStatus = nextStatus;

        if (ownerWindowLabel) {
          await emitReady(ownerWindowLabel);
        }

        void Promise.allSettled([currentWindow.setIgnoreCursorEvents(true), currentWindow.hide()]);
      } catch (error) {
        console.error("Failed to initialize overlay host window:", error);
      }
    })();

    return () => {
      disposed = true;
      unlistenPresent?.();
      unlistenAnchor?.();
      unlistenClose?.();
      unlistenStatus?.();
    };
  }, [ownerWindowLabel]);

  useEffect(() => {
    if (!overlay || overlay.kind !== "git-actions") {
      draftOverlayIdRef.current = null;
      setDraftCommitMessage("");
      return;
    }

    if (draftOverlayIdRef.current === overlay.overlayId) {
      return;
    }

    draftOverlayIdRef.current = overlay.overlayId;
    setDraftCommitMessage(overlay.commitMessage);
  }, [overlay]);

  useEffect(() => {
    if (!overlay) {
      return;
    }

    applyThemeToRoot(overlay.resolvedTheme);
  }, [overlay?.resolvedTheme]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const currentWindow = getCurrentWindow();

    if (overlay) {
      logOverlayDebug("host:overlay-visible", {
        kind: overlay.kind,
        overlayId: overlay.overlayId,
        requiresWindowFocus: overlay.requiresWindowFocus,
      });
      void (async () => {
        await Promise.allSettled([
          currentWindow.setIgnoreCursorEvents(false),
          currentWindow.setFocusable(overlay.requiresWindowFocus),
        ]);
        await currentWindow.show().catch((error) => {
          console.error("Failed to show overlay host window:", error);
        });
        if (overlay.requiresWindowFocus) {
          await currentWindow.setFocus().catch((error) => {
            console.error("Failed to focus overlay host window:", error);
          });
          return;
        }

        await currentWindow.setFocusable(true).catch((error) => {
          console.error("Failed to re-enable overlay host focusability:", error);
        });
      })();
      return;
    }

    logOverlayDebug("host:overlay-hidden");
    void (async () => {
      await Promise.allSettled([currentWindow.setIgnoreCursorEvents(true), currentWindow.hide()]);
      await currentWindow.setFocusable(false).catch((error) => {
        console.error("Failed to reset overlay host focusable state:", error);
      });
    })();
  }, [overlay]);

  useShortcutRegistration({
    allowInEditable: true,
    enabled: overlay !== null,
    handler: () => {
      if (!overlay) {
        return false;
      }

      void requestClose(overlay);
    },
    id: "overlay.close",
    priority: SHORTCUT_HANDLER_PRIORITY.overlay,
  });

  const frame = useMemo(() => {
    if (!overlay) {
      return null;
    }

    return computeHostedOverlayFrame({
      anchor: overlay.anchor,
      placement: overlay.placement,
      viewport,
    });
  }, [overlay, viewport]);

  async function emitAction(action: HostedOverlayAction): Promise<void> {
    if (!isTauri()) {
      return;
    }

    await getCurrentWebviewWindow().emitTo(
      webviewWindowTarget(action.ownerWindowLabel),
      OVERLAY_HOST_ACTION_EVENT,
      action,
    );
  }

  async function requestClose(currentOverlay: HostedOverlayPayload): Promise<void> {
    if (!isTauri()) {
      setOverlay(null);
      return;
    }

    setOverlay(null);
    await getCurrentWebviewWindow().emitTo<HostedOverlayCloseRequest>(
      webviewWindowTarget(currentOverlay.ownerWindowLabel),
      OVERLAY_HOST_REQUEST_CLOSE_EVENT,
      {
        overlayId: currentOverlay.overlayId,
        ownerWindowLabel: currentOverlay.ownerWindowLabel,
      },
    );
  }

  function renderOverlay(currentOverlay: HostedOverlayPayload) {
    if (currentOverlay.kind === "workspace-open-in") {
      return (
        <WorkspaceOpenInMenu
          availableTargets={currentOverlay.availableTargets}
          autoFocusTargetId={currentOverlay.autoFocusTargetId}
          launchError={currentOverlay.launchError}
          launchingTarget={currentOverlay.launchingTarget}
          onOpenIn={(appId) =>
            void emitAction({
              action: "open-in",
              appId,
              kind: "workspace-open-in",
              overlayId: currentOverlay.overlayId,
              ownerWindowLabel: currentOverlay.ownerWindowLabel,
            })
          }
          useNativeCursorTracking
        />
      );
    }

    return renderGitActionsOverlay(
      currentOverlay,
      draftCommitMessage,
      setDraftCommitMessage,
      emitAction,
    );
  }

  return (
    <div
      className="fixed inset-0"
      onMouseDown={(event) => {
        if (!overlay || event.target !== event.currentTarget) {
          return;
        }

        void requestClose(overlay);
      }}
    >
      {overlay && frame && (
        <div
          className="absolute overflow-y-auto rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[0_20px_64px_rgba(0,0,0,0.18)]"
          style={{
            left: `${frame.left}px`,
            maxHeight: `${frame.maxHeight}px`,
            top: `${frame.top}px`,
            width: `${frame.width}px`,
          }}
        >
          {renderOverlay(overlay)}
        </div>
      )}
    </div>
  );
}

function renderGitActionsOverlay(
  overlay: HostedGitActionsOverlay,
  draftCommitMessage: string,
  setDraftCommitMessage: (value: string) => void,
  emitAction: (action: HostedOverlayAction) => Promise<void>,
) {
  return (
    <GitActionMenuContent
      actionError={overlay.actionError}
      autoFocusCommitMessage
      branchPullRequest={overlay.branchPullRequest}
      commitMessage={draftCommitMessage}
      gitStatus={overlay.gitStatus}
      isCommitting={overlay.isCommitting}
      isCreatingPullRequest={overlay.isCreatingPullRequest}
      isLoading={overlay.isLoading}
      isMergingPullRequest={overlay.isMergingPullRequest}
      isPushingBranch={overlay.isPushingBranch}
      onCommit={(pushAfterCommit) =>
        emitAction({
          action: "commit",
          kind: "git-actions",
          message: draftCommitMessage,
          overlayId: overlay.overlayId,
          ownerWindowLabel: overlay.ownerWindowLabel,
          pushAfterCommit,
        })
      }
      onCommitMessageChange={setDraftCommitMessage}
      onCreatePullRequest={() =>
        emitAction({
          action: "create-pull-request",
          kind: "git-actions",
          overlayId: overlay.overlayId,
          ownerWindowLabel: overlay.ownerWindowLabel,
        })
      }
      onMergePullRequest={(pullRequestNumber) =>
        emitAction({
          action: "merge-pull-request",
          kind: "git-actions",
          overlayId: overlay.overlayId,
          ownerWindowLabel: overlay.ownerWindowLabel,
          pullRequestNumber,
        })
      }
      onOpenPullRequest={(pullRequest) =>
        emitAction({
          action: "open-pull-request",
          kind: "git-actions",
          overlayId: overlay.overlayId,
          ownerWindowLabel: overlay.ownerWindowLabel,
          url: pullRequest.url,
        })
      }
      onPushBranch={() =>
        emitAction({
          action: "push-branch",
          kind: "git-actions",
          overlayId: overlay.overlayId,
          ownerWindowLabel: overlay.ownerWindowLabel,
        })
      }
      onShowChanges={() =>
        emitAction({
          action: "show-changes",
          kind: "git-actions",
          overlayId: overlay.overlayId,
          ownerWindowLabel: overlay.ownerWindowLabel,
        })
      }
    />
  );
}
