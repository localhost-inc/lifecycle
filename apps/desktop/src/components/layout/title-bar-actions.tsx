import { isTauri } from "@tauri-apps/api/core";
import { message } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SplitButton,
  SplitButtonPrimary,
  SplitButtonSecondary,
  useTheme,
} from "@lifecycle/ui";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { isMacPlatform } from "../../app/app-hotkeys";
import {
  listWorkspaceOpenInApps,
  openWorkspaceInApp,
  showWorkspaceOpenInMenu,
  subscribeToWorkspaceOpenInMenuEvents,
  type WorkspaceOpenInAppInfo,
  type OpenInAppId,
} from "../../features/workspaces/api";

interface OpenInTarget {
  id: OpenInAppId;
  iconDataUrl?: string | null;
  label: string;
  macOnly?: boolean;
}

const DEFAULT_OPEN_TARGET: OpenInAppId = "vscode";
const OPEN_IN_TARGETS: readonly OpenInTarget[] = [
  { id: "vscode", label: "VS Code" },
  { id: "cursor", label: "Cursor" },
  { id: "windsurf", label: "Windsurf" },
  { id: "finder", label: "Finder", macOnly: true },
  { id: "terminal", label: "Terminal", macOnly: true },
  { id: "iterm", label: "iTerm2", macOnly: true },
  { id: "ghostty", label: "Ghostty", macOnly: true },
  { id: "warp", label: "Warp", macOnly: true },
  { id: "xcode", label: "Xcode", macOnly: true },
];

function isSupportedOpenInAppId(value: string | null): value is OpenInAppId {
  return (
    value === "cursor" ||
    value === "finder" ||
    value === "ghostty" ||
    value === "iterm" ||
    value === "terminal" ||
    value === "vscode" ||
    value === "warp" ||
    value === "windsurf" ||
    value === "xcode" ||
    value === "zed"
  );
}

function listAvailableOpenInTargets(macPlatform: boolean): readonly OpenInTarget[] {
  return OPEN_IN_TARGETS.filter((target) => !target.macOnly || macPlatform);
}

export function resolveDefaultOpenTarget(availableTargets: readonly OpenInTarget[]): OpenInTarget {
  return (
    availableTargets.find((target) => target.id === DEFAULT_OPEN_TARGET) ?? availableTargets[0]!
  );
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

function AppIconTile({
  children,
  className,
  sizeClass = "size-6",
}: {
  children: ReactNode;
  className: string;
  sizeClass?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--background)]/60",
        sizeClass,
        className,
      )}
    >
      {children}
    </span>
  );
}

function OpenInAppIcon({
  appId,
  iconDataUrl,
  sizeClass,
}: {
  appId: OpenInAppId;
  iconDataUrl?: string | null;
  sizeClass?: string;
}) {
  if (iconDataUrl) {
    return (
      <img
        alt=""
        aria-hidden
        className={cn("shrink-0 object-contain", sizeClass ?? "size-6")}
        src={iconDataUrl}
      />
    );
  }

  switch (appId) {
    case "vscode":
      return (
        <AppIconTile className="bg-[#1f9cf0]" sizeClass={sizeClass}>
          <svg aria-hidden className="size-5" viewBox="0 0 24 24">
            <path d="M17.4 3.4 7.7 12l9.7 8.6 2.2-1.1V4.5z" fill="#fff" opacity="0.95" />
            <path d="m7.7 12-4.1-3.7L6 6.8l5.4 5.2L6 17.2l-2.4-1.5z" fill="#dff2ff" />
          </svg>
        </AppIconTile>
      );
    case "cursor":
      return (
        <AppIconTile className="bg-[linear-gradient(180deg,#202020,#050505)]" sizeClass={sizeClass}>
          <svg aria-hidden className="size-4" viewBox="0 0 24 24">
            <path
              d="m8.2 4.5 5 2.9-2.9 5-5-2.9zm7.6 0 3.7 3.7-5 2.9-2.8-5zm-7.6 15 2.9-5 5 2.8-3.7 3.8zm9-2.2-2.8-5 5-2.9v7.9z"
              fill="#f5f5f5"
            />
          </svg>
        </AppIconTile>
      );
    case "windsurf":
      return (
        <AppIconTile className="bg-[#f4f0e7]" sizeClass={sizeClass}>
          <svg aria-hidden className="size-4" viewBox="0 0 24 24">
            <path
              d="M4.5 8.5c2.2 0 2.2 3 4.4 3s2.2-3 4.4-3 2.2 3 4.4 3M4.5 14.8c2.2 0 2.2-3 4.4-3s2.2 3 4.4 3 2.2-3 4.4-3"
              fill="none"
              stroke="#101010"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
            />
          </svg>
        </AppIconTile>
      );
    case "finder":
      return (
        <AppIconTile className="bg-[linear-gradient(180deg,#68b8ff,#1677ff)]" sizeClass={sizeClass}>
          <svg aria-hidden className="size-5" viewBox="0 0 24 24">
            <path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7z" fill="#8ed0ff" />
            <path d="M5 3h7v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2" fill="#2f7cff" />
            <path d="M12 4v16" stroke="#081a33" strokeWidth="1.6" />
            <path
              d="M7.2 10.1h1.5m8.1 0h-1.5M8.1 14.8c1.1.9 2.4 1.3 3.9 1.3s2.8-.4 3.9-1.3"
              stroke="#081a33"
              strokeLinecap="round"
              strokeWidth="1.6"
            />
          </svg>
        </AppIconTile>
      );
    case "terminal":
      return (
        <AppIconTile className="bg-[linear-gradient(180deg,#2f2f32,#101012)]" sizeClass={sizeClass}>
          <svg aria-hidden className="size-[18px]" viewBox="0 0 24 24">
            <path
              d="m6 8 4 4-4 4"
              fill="none"
              stroke="#f4f4f5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
            />
            <path d="M12.8 16h5.2" stroke="#f4f4f5" strokeLinecap="round" strokeWidth="2" />
          </svg>
        </AppIconTile>
      );
    case "iterm":
      return (
        <AppIconTile
          className="bg-[radial-gradient(circle_at_top_left,#3e134f,#090a13_70%)]"
          sizeClass={sizeClass}
        >
          <svg aria-hidden className="size-[18px]" viewBox="0 0 24 24">
            <path
              d="m6 8 3.2 4L6 16"
              fill="none"
              stroke="#45ff7b"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
            />
            <path d="M12.2 16.2H18" stroke="#45ff7b" strokeLinecap="round" strokeWidth="2.2" />
          </svg>
        </AppIconTile>
      );
    case "ghostty":
      return (
        <AppIconTile className="bg-[linear-gradient(180deg,#4a8dff,#173d9e)]" sizeClass={sizeClass}>
          <svg aria-hidden className="size-5" viewBox="0 0 24 24">
            <rect x="4.2" y="5.4" width="15.6" height="13.2" rx="3" fill="#d6e6ff" opacity="0.25" />
            <rect
              x="5.6"
              y="6.8"
              width="12.8"
              height="10.4"
              rx="2.2"
              fill="#0b0f1a"
              opacity="0.85"
            />
            <path
              d="m8.2 10.2 2.4 2.2-2.4 2.2"
              fill="none"
              stroke="#e6f2ff"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <path d="M12.7 14.3h3.1" stroke="#e6f2ff" strokeLinecap="round" strokeWidth="1.8" />
          </svg>
        </AppIconTile>
      );
    case "warp":
      return (
        <AppIconTile className="bg-[linear-gradient(180deg,#d8d9de,#8f939d)]" sizeClass={sizeClass}>
          <svg aria-hidden className="size-[18px]" viewBox="0 0 24 24">
            <path
              d="M6.5 7.8 12 12l5.5-4.2v2.7L12 14.6l-5.5-4.1zM6.5 12.1 12 16.2l5.5-4.1v2.8L12 19l-5.5-4.1z"
              fill="#15161a"
            />
          </svg>
        </AppIconTile>
      );
    case "xcode":
      return (
        <AppIconTile className="bg-[linear-gradient(180deg,#37b2ff,#0b63ff)]" sizeClass={sizeClass}>
          <svg aria-hidden className="size-[18px]" viewBox="0 0 24 24">
            <path d="m6.5 16.8 6.7-6.7 1.8 1.8-6.7 6.7H6.5z" fill="#eaf4ff" />
            <path d="m13.6 7.5 1.9-1.9 2.9 2.9-1.9 1.9z" fill="#a6dbff" />
            <path d="m9.4 9.2 1.6-1.6 4.8 4.8-1.6 1.6z" fill="#0a2354" opacity="0.45" />
            <path d="m5.5 18.5 2.5-.4-.4-2.5z" fill="#ffb457" />
          </svg>
        </AppIconTile>
      );
    default:
      return (
        <AppIconTile className="bg-[linear-gradient(180deg,#3f3f46,#18181b)]" sizeClass={sizeClass}>
          <span className="text-[11px] font-semibold text-white">Z</span>
        </AppIconTile>
      );
  }
}

interface TitleBarActionsProps {
  workspace: WorkspaceRecord;
}

export function TitleBarActions({ workspace }: TitleBarActionsProps) {
  const { resolvedAppearance } = useTheme();
  const [baseAvailableTargets] = useState(() => listAvailableOpenInTargets(isMacPlatform()));
  const launcherRef = useRef<HTMLDivElement | null>(null);
  const [availableTargets, setAvailableTargets] =
    useState<readonly OpenInTarget[]>(baseAvailableTargets);
  const [openInOpen, setOpenInOpen] = useState(false);
  const [launchingTarget, setLaunchingTarget] = useState<OpenInAppId | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const usesNativeOpenInMenu = isMacPlatform() && isTauri();

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
    if (!usesNativeOpenInMenu) {
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
  }, [baseAvailableTargets, usesNativeOpenInMenu]);

  useEffect(() => {
    if (!usesNativeOpenInMenu) {
      return;
    }

    let unlisten: (() => void) | null = null;
    let disposed = false;

    void subscribeToWorkspaceOpenInMenuEvents((event) => {
      if (event.workspace_id !== workspace.id || !isSupportedOpenInAppId(event.app_id)) {
        return;
      }

      if (event.error) {
        void message(event.error, {
          kind: "error",
          title: "Unable to open workspace",
        });
        return;
      }

      setLaunchError(null);
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
        return;
      }

      unlisten = nextUnlisten;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [usesNativeOpenInMenu, workspace.id]);

  async function presentLaunchError(errorText: string): Promise<void> {
    if (usesNativeOpenInMenu) {
      await message(errorText, {
        kind: "error",
        title: "Unable to open workspace",
      });
      return;
    }

    setLaunchError(errorText);
    setOpenInOpen(true);
  }

  async function handleOpenIn(appId: OpenInAppId): Promise<void> {
    setLaunchError(null);
    setLaunchingTarget(appId);

    try {
      await openWorkspaceInApp(workspace.id, appId);
      setOpenInOpen(false);
    } catch (error) {
      const nextError = describeOpenInError(error);
      console.error("Failed to open workspace in app:", error);
      await presentLaunchError(nextError);
    } finally {
      setLaunchingTarget(null);
    }
  }

  async function handleShowNativeOpenInMenu(): Promise<void> {
    const rect = launcherRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    setLaunchError(null);

    try {
      await syncInstalledTargets();
      await showWorkspaceOpenInMenu(
        workspace.id,
        defaultTarget.id,
        resolvedAppearance,
        rect.left,
        rect.bottom + 4,
      );
    } catch (error) {
      const nextError = describeOpenInError(error);
      console.error("Failed to show workspace open-in menu:", error);
      await presentLaunchError(nextError);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <SplitButton ref={launcherRef}>
        <SplitButtonPrimary
          disabled={launchingTarget !== null}
          leadingIcon={
            <OpenInAppIcon
              appId={defaultTarget.id}
              iconDataUrl={defaultTarget.iconDataUrl}
              sizeClass="size-[22px]"
            />
          }
          onClick={() => void handleOpenIn(defaultTarget.id)}
          title={`Open in ${defaultTarget.label}`}
        >
          Open
        </SplitButtonPrimary>

        {usesNativeOpenInMenu ? (
          <SplitButtonSecondary
            aria-label="Choose app"
            disabled={launchingTarget !== null}
            onClick={() => void handleShowNativeOpenInMenu()}
          >
            <ChevronDown className="size-3.5" strokeWidth={2.4} />
          </SplitButtonSecondary>
        ) : (
          <Popover open={openInOpen} onOpenChange={setOpenInOpen}>
            <PopoverTrigger asChild>
              <SplitButtonSecondary aria-label="Choose app" disabled={launchingTarget !== null}>
                <ChevronDown className="size-3.5" strokeWidth={2.4} />
              </SplitButtonSecondary>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[18rem] rounded-[22px] border-[var(--border)] bg-[var(--card)] p-3 shadow-[0_20px_64px_rgba(0,0,0,0.18)]"
              side="bottom"
              sideOffset={8}
            >
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
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left text-[14px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-60",
                      target.id === defaultTarget.id && "bg-[var(--surface-selected)]",
                    )}
                    disabled={launchingTarget !== null}
                    key={target.id}
                    onClick={() => void handleOpenIn(target.id)}
                    type="button"
                  >
                    <OpenInAppIcon appId={target.id} iconDataUrl={target.iconDataUrl} />
                    <span>{target.label}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </SplitButton>
    </div>
  );
}
