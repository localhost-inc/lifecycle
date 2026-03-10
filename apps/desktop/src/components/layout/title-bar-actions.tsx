import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  SplitButton,
  SplitButtonPrimary,
  SplitButtonSecondary,
} from "@lifecycle/ui";
import { ChevronDown } from "lucide-react";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { isMacPlatform } from "../../app/app-hotkeys";
import type { HostedOverlayAction } from "../../features/overlays/overlay-contract";
import { useHostedOverlay } from "../../features/overlays/use-hosted-overlay";
import {
  listWorkspaceOpenInApps,
  openWorkspaceInApp,
  type WorkspaceOpenInAppInfo,
  type OpenInAppId,
} from "../../features/workspaces/api";
import { OpenInAppIcon } from "../../features/workspaces/components/open-in-app-icon";
import { WorkspaceOpenInMenu } from "../../features/workspaces/components/workspace-open-in-menu";
import {
  listAvailableOpenInTargets,
  resolveDefaultOpenTarget,
  type OpenInTarget,
} from "../../features/workspaces/lib/open-in-targets";

interface TitleBarActionsProps {
  workspace: WorkspaceRecord;
}

function describeOpenInError(error: unknown): string {
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (
    error !== null &&
    typeof error === "object" &&
    "reason" in error &&
    typeof error.reason === "string" &&
    error.reason.trim().length > 0
  ) {
    return error.reason;
  }

  return "Unable to open this workspace in the selected app.";
}

export function TitleBarActions({ workspace }: TitleBarActionsProps) {
  const [baseAvailableTargets] = useState(() => listAvailableOpenInTargets(isMacPlatform()));
  const [availableTargets, setAvailableTargets] =
    useState<readonly OpenInTarget[]>(baseAvailableTargets);
  const [openInOpen, setOpenInOpen] = useState(false);
  const [openInKeyboardMode, setOpenInKeyboardMode] = useState(false);
  const [launchingTarget, setLaunchingTarget] = useState<OpenInAppId | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

  const defaultTarget = resolveDefaultOpenTarget(availableTargets);

  function mergeInstalledTargets(
    installedApps: readonly WorkspaceOpenInAppInfo[],
  ): readonly OpenInTarget[] {
    const installedTargets: OpenInTarget[] = [];

    for (const target of baseAvailableTargets) {
      const installedApp = installedApps.find((app) => app.id === target.id);
      if (!installedApp) {
        continue;
      }

      installedTargets.push({
        ...target,
        iconDataUrl: installedApp.icon_data_url,
        label: installedApp.label,
      });
    }

    if (installedTargets.length > 0) {
      return installedTargets;
    }

    return baseAvailableTargets;
  }

  async function syncInstalledTargets(): Promise<void> {
    setAvailableTargets(mergeInstalledTargets(await listWorkspaceOpenInApps()));
  }

  useEffect(() => {
    if (!isTauri()) {
      setAvailableTargets(baseAvailableTargets);
      return;
    }

    let cancelled = false;

    void listWorkspaceOpenInApps()
      .then((installedApps) => {
        if (cancelled) {
          return;
        }

        setAvailableTargets(mergeInstalledTargets(installedApps));
      })
      .catch((error) => {
        console.error("Failed to list installed workspace open-in apps:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [baseAvailableTargets]);

  async function presentLaunchError(errorText: string): Promise<void> {
    setLaunchError(errorText);
    setOpenInOpen(true);
  }

  async function handleOpenIn(appId: OpenInAppId): Promise<void> {
    setLaunchError(null);
    setLaunchingTarget(appId);

    try {
      await openWorkspaceInApp(workspace.id, appId);
      setOpenInOpen(false);
      if (isTauri()) {
        await syncInstalledTargets().catch(() => undefined);
      }
    } catch (error) {
      const nextError = describeOpenInError(error);
      console.error("Failed to open workspace in app:", error);
      await presentLaunchError(nextError);
    } finally {
      setLaunchingTarget(null);
    }
  }

  const hostedOverlayPayload = useMemo(
    () => ({
      availableTargets,
      autoFocusTargetId: openInKeyboardMode ? defaultTarget.id : null,
      kind: "workspace-open-in" as const,
      launchError,
      launchingTarget,
      placement: {
        align: "end" as const,
        estimatedHeight: 352,
        gutter: 16,
        preferredWidth: 248,
        side: "bottom" as const,
        sideOffset: 8,
      },
      requiresWindowFocus: openInKeyboardMode,
    }),
    [availableTargets, defaultTarget.id, launchError, launchingTarget, openInKeyboardMode],
  );

  const hostedOpenIn = useHostedOverlay({
    anchorRef: menuTriggerRef,
    onAction: (action: HostedOverlayAction) => {
      if (action.kind !== "workspace-open-in" || action.action !== "open-in") {
        return;
      }

      void handleOpenIn(action.appId);
    },
    onRequestClose: () => {
      setOpenInOpen(false);
    },
    open: openInOpen,
    payload: hostedOverlayPayload,
  });

  const usesHostedOpenInMenu = hostedOpenIn.hosted;

  function handleOpenInKeyboardIntent(key: string): boolean {
    if (key !== "Enter" && key !== " " && key !== "ArrowDown" && key !== "ArrowUp") {
      return false;
    }

    setOpenInKeyboardMode(true);
    return key === "ArrowDown" || key === "ArrowUp";
  }

  return (
    <div className="flex items-center gap-1.5">
      <SplitButton>
        <SplitButtonPrimary
          disabled={launchingTarget !== null}
          leadingIcon={
            <OpenInAppIcon
              appId={defaultTarget.id}
              iconDataUrl={defaultTarget.iconDataUrl}
              sizeClass="size-[21px]"
            />
          }
          onClick={() => void handleOpenIn(defaultTarget.id)}
          title={`Open in ${defaultTarget.label}`}
        >
          Open
        </SplitButtonPrimary>

        {usesHostedOpenInMenu ? (
          <SplitButtonSecondary
            aria-label="Choose app"
            disabled={launchingTarget !== null}
            onKeyDown={(event) => {
              const shouldOpen = handleOpenInKeyboardIntent(event.key);
              if (!shouldOpen) {
                return;
              }

              event.preventDefault();
              setLaunchError(null);
              setOpenInOpen(true);
            }}
            onPointerDown={() => {
              setOpenInKeyboardMode(false);
            }}
            onClick={() => {
              setLaunchError(null);
              setOpenInOpen((current) => !current);
            }}
            ref={menuTriggerRef}
          >
            <ChevronDown className="size-3.5" strokeWidth={2.4} />
          </SplitButtonSecondary>
        ) : (
          <Popover open={openInOpen} onOpenChange={setOpenInOpen}>
            <PopoverTrigger asChild>
              <SplitButtonSecondary
                aria-label="Choose app"
                disabled={launchingTarget !== null}
                onKeyDown={(event) => {
                  const shouldOpen = handleOpenInKeyboardIntent(event.key);
                  if (!shouldOpen) {
                    return;
                  }

                  event.preventDefault();
                  setOpenInOpen(true);
                }}
                onPointerDown={() => {
                  setOpenInKeyboardMode(false);
                }}
                ref={menuTriggerRef}
              >
                <ChevronDown className="size-3.5" strokeWidth={2.4} />
              </SplitButtonSecondary>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[18rem] rounded-[22px] border-[var(--border)] bg-[var(--card)] p-3 shadow-[0_20px_64px_rgba(0,0,0,0.18)]"
              side="bottom"
              sideOffset={8}
            >
              <WorkspaceOpenInMenu
                availableTargets={availableTargets}
                autoFocusTargetId={openInKeyboardMode ? defaultTarget.id : null}
                launchError={launchError}
                launchingTarget={launchingTarget}
                onOpenIn={(appId) => void handleOpenIn(appId)}
              />
            </PopoverContent>
          </Popover>
        )}
      </SplitButton>
    </div>
  );
}
