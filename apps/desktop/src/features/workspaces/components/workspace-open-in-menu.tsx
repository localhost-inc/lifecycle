import { invoke, isTauri } from "@tauri-apps/api/core";
import { cn } from "@lifecycle/ui";
import { useEffect, useRef, useState } from "react";
import type { OpenInAppId } from "@/features/workspaces/open-in-api";
import type { OpenInTarget } from "@/features/workspaces/lib/open-in-targets";
import { OpenInAppIcon } from "@/features/workspaces/components/open-in-app-icon";

interface WorkspaceOpenInMenuProps {
  availableTargets: readonly OpenInTarget[];
  autoFocusTargetId?: OpenInAppId | null;
  launchError: string | null;
  launchingTarget: OpenInAppId | null;
  onOpenIn: (appId: OpenInAppId) => void;
  useNativeCursorTracking?: boolean;
}

export function getWorkspaceOpenInItemClassName({ highlighted }: { highlighted: boolean }): string {
  return cn(
    "flex w-full cursor-pointer items-center gap-3 rounded-[14px] px-2.5 py-2 text-left text-[14px] font-medium text-[var(--foreground)] outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:cursor-default disabled:opacity-60",
    highlighted && "bg-[var(--surface-hover)]",
  );
}

export function WorkspaceOpenInMenu({
  availableTargets,
  autoFocusTargetId = null,
  launchError,
  launchingTarget,
  onOpenIn,
  useNativeCursorTracking = false,
}: WorkspaceOpenInMenuProps) {
  const [highlightedTargetId, setHighlightedTargetId] = useState<OpenInAppId | null>(null);
  const itemRefs = useRef(new Map<OpenInAppId, HTMLButtonElement | null>());

  useEffect(() => {
    if (!autoFocusTargetId) {
      return;
    }

    itemRefs.current.get(autoFocusTargetId)?.focus();
  }, [autoFocusTargetId]);

  useEffect(() => {
    if (!useNativeCursorTracking || !isTauri()) {
      return;
    }

    let frameId = 0;
    let disposed = false;

    const tick = async () => {
      try {
        const pointer = await invoke<{ x: number; y: number } | null>("get_window_mouse_position");
        if (disposed || !pointer) {
          return;
        }

        let nextHighlightedTargetId: OpenInAppId | null = null;
        for (const [targetId, element] of itemRefs.current) {
          if (!element) {
            continue;
          }

          const rect = element.getBoundingClientRect();
          if (
            pointer.x >= rect.left &&
            pointer.x <= rect.right &&
            pointer.y >= rect.top &&
            pointer.y <= rect.bottom
          ) {
            nextHighlightedTargetId = targetId;
            break;
          }
        }

        setHighlightedTargetId((current) =>
          current === nextHighlightedTargetId ? current : nextHighlightedTargetId,
        );
      } catch (error) {
        if (!disposed) {
          console.warn("Failed to poll hosted menu cursor position:", error);
        }
      } finally {
        if (!disposed) {
          frameId = window.requestAnimationFrame(() => {
            void tick();
          });
        }
      }
    };

    frameId = window.requestAnimationFrame(() => {
      void tick();
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [useNativeCursorTracking]);

  useEffect(() => {
    if (!useNativeCursorTracking || !isTauri()) {
      return;
    }

    void invoke("set_window_pointing_cursor", {
      pointing: highlightedTargetId !== null && launchingTarget === null,
    }).catch((error) => {
      console.warn("Failed to update hosted menu cursor:", error);
    });

    return () => {
      void invoke("set_window_pointing_cursor", {
        pointing: false,
      }).catch(() => undefined);
    };
  }, [highlightedTargetId, launchingTarget, useNativeCursorTracking]);

  return (
    <>
      <div className="px-2 pb-2 pt-1 text-[14px] font-medium text-[var(--muted-foreground)]">
        Open in
      </div>

      {launchError && (
        <div
          className="mx-2 mb-2 rounded-2xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/8 px-3 py-2 text-[12px] text-[var(--destructive)]"
          role="alert"
        >
          {launchError}
        </div>
      )}

      <div className="space-y-0.5">
        {availableTargets.map((target) => (
          <button
            className={getWorkspaceOpenInItemClassName({
              highlighted: highlightedTargetId === target.id,
            })}
            disabled={launchingTarget !== null}
            key={target.id}
            onClick={() => onOpenIn(target.id)}
            onBlur={() => {
              setHighlightedTargetId((current) => (current === target.id ? null : current));
            }}
            onFocus={() => {
              setHighlightedTargetId(target.id);
            }}
            onPointerLeave={() => {
              setHighlightedTargetId((current) => (current === target.id ? null : current));
            }}
            onPointerMove={() => {
              setHighlightedTargetId((current) => (current === target.id ? current : target.id));
            }}
            ref={(node) => {
              itemRefs.current.set(target.id, node);
            }}
            type="button"
          >
            <OpenInAppIcon appId={target.id} iconDataUrl={target.iconDataUrl} />
            <span>{target.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
