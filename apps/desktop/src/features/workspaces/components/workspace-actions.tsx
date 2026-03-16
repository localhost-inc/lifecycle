import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SplitButton,
  SplitButtonPrimary,
  SplitButtonSecondary,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@lifecycle/ui";
import { ChevronDown, GitFork, Trash2 } from "lucide-react";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { isMacPlatform } from "../../../app/app-hotkeys";
import {
  listWorkspaceOpenInApps,
  openWorkspaceInApp,
  type WorkspaceOpenInAppInfo,
  type OpenInAppId,
} from "../open-in-api";
import { OpenInAppIcon } from "./open-in-app-icon";
import { WorkspaceOpenInMenu } from "./workspace-open-in-menu";
import {
  listAvailableOpenInTargets,
  resolveDefaultOpenTarget,
  type OpenInTarget,
} from "../lib/open-in-targets";

interface WorkspaceActionsProps {
  workspace: WorkspaceRecord;
  onFork?: () => void;
  onDestroy?: () => Promise<void> | void;
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

export function WorkspaceActions({ workspace, onDestroy, onFork }: WorkspaceActionsProps) {
  const [baseAvailableTargets] = useState(() => listAvailableOpenInTargets(isMacPlatform()));
  const [availableTargets, setAvailableTargets] =
    useState<readonly OpenInTarget[]>(baseAvailableTargets);
  const [openInOpen, setOpenInOpen] = useState(false);
  const [openInKeyboardMode, setOpenInKeyboardMode] = useState(false);
  const [destroying, setDestroying] = useState(false);
  const [launchingTarget, setLaunchingTarget] = useState<OpenInAppId | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const defaultTarget = resolveDefaultOpenTarget(availableTargets);
  const interactionLocked = launchingTarget !== null || destroying;

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

  async function handleDestroy(): Promise<void> {
    if (!onDestroy || destroying) {
      return;
    }

    setDestroying(true);
    try {
      await onDestroy();
    } finally {
      setDestroying(false);
    }
  }

  function handleOpenInKeyboardIntent(key: string): boolean {
    if (key !== "Enter" && key !== " " && key !== "ArrowDown" && key !== "ArrowUp") {
      return false;
    }

    setOpenInKeyboardMode(true);
    return key === "ArrowDown" || key === "ArrowUp";
  }

  return (
    <TooltipProvider>
      <SplitButton>
        <SplitButtonPrimary
          disabled={interactionLocked}
          leadingIcon={
            <OpenInAppIcon
              appId={defaultTarget.id}
              iconDataUrl={defaultTarget.iconDataUrl}
              sizeClass="size-[18px]"
            />
          }
          onClick={() => void handleOpenIn(defaultTarget.id)}
          title={`Open in ${defaultTarget.label}`}
        >
          Open
        </SplitButtonPrimary>
        <Popover open={openInOpen} onOpenChange={setOpenInOpen}>
          <PopoverTrigger asChild>
            <SplitButtonSecondary
              aria-label="Choose app"
              disabled={interactionLocked}
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
      </SplitButton>
      {onFork && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="Fork workspace" disabled={interactionLocked} onClick={onFork} size="icon">
              <GitFork size={14} strokeWidth={2.2} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fork workspace</TooltipContent>
        </Tooltip>
      )}
      {onDestroy && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={destroying ? "Destroying workspace" : "Destroy workspace"}
              disabled={interactionLocked}
              onClick={() => void handleDestroy()}
              size="icon"
            >
              <Trash2 size={14} strokeWidth={2.2} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{destroying ? "Destroying workspace" : "Destroy workspace"}</TooltipContent>
        </Tooltip>
      )}
    </TooltipProvider>
  );
}
