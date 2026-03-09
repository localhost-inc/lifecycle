import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn, Popover, PopoverContent, PopoverTrigger } from "@lifecycle/ui";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { isMacPlatform } from "../../app/app-hotkeys";
import { openWorkspaceInApp, type OpenInAppId } from "../../features/workspaces/api";

interface OpenInTarget {
  id: OpenInAppId;
  label: string;
  macOnly?: boolean;
}

const DEFAULT_OPEN_TARGET: OpenInAppId = "vscode";
const PREFERRED_OPEN_TARGET_KEY = "lifecycle.desktop.preferred-open-target";
const LEGACY_PREFERRED_EDITOR_KEY = "lifecycle.desktop.preferred-editor";
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

function normalizePreferredTarget(
  value: string | null,
  availableTargets: readonly OpenInTarget[],
): OpenInAppId {
  if (isSupportedOpenInAppId(value) && availableTargets.some((target) => target.id === value)) {
    return value;
  }

  return (
    availableTargets.find((target) => target.id === DEFAULT_OPEN_TARGET)?.id ??
    availableTargets[0]!.id
  );
}

function getStoredPreferredTarget(availableTargets: readonly OpenInTarget[]): OpenInAppId {
  if (typeof window === "undefined") {
    return normalizePreferredTarget(null, availableTargets);
  }

  const storedTarget =
    window.localStorage.getItem(PREFERRED_OPEN_TARGET_KEY) ??
    window.localStorage.getItem(LEGACY_PREFERRED_EDITOR_KEY);

  return normalizePreferredTarget(storedTarget, availableTargets);
}

function persistPreferredTarget(appId: OpenInAppId): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PREFERRED_OPEN_TARGET_KEY, appId);
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
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-white/10 bg-black/20",
        sizeClass,
        className,
      )}
    >
      {children}
    </span>
  );
}

function OpenInAppIcon({ appId, sizeClass }: { appId: OpenInAppId; sizeClass?: string }) {
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
  const availableTargets = listAvailableOpenInTargets(isMacPlatform());
  const [preferredTargetId, setPreferredTargetId] = useState(() =>
    getStoredPreferredTarget(availableTargets),
  );
  const [openInOpen, setOpenInOpen] = useState(false);
  const [launchingTarget, setLaunchingTarget] = useState<OpenInAppId | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const preferredTarget =
    availableTargets.find((target) => target.id === preferredTargetId) ?? availableTargets[0]!;

  async function handleOpenIn(appId: OpenInAppId): Promise<void> {
    setLaunchError(null);
    setLaunchingTarget(appId);

    try {
      await openWorkspaceInApp(workspace.id, appId);
      persistPreferredTarget(appId);
      setPreferredTargetId(appId);
      setOpenInOpen(false);
    } catch (error) {
      const nextError = describeOpenInError(error);
      console.error("Failed to open workspace in app:", error);
      setLaunchError(nextError);
      setOpenInOpen(true);
    } finally {
      setLaunchingTarget(null);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center overflow-hidden rounded-[13px] border border-[rgba(255,255,255,0.09)] bg-[rgba(22,22,24,0.94)] shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
        <button
          className="flex h-8 items-center gap-2 bg-transparent pl-2 pr-2.5 text-[12px] font-semibold text-[var(--foreground)] transition-colors hover:bg-white/[0.035] disabled:cursor-default disabled:opacity-60"
          disabled={launchingTarget !== null}
          onClick={() => void handleOpenIn(preferredTarget.id)}
          title={`Open in ${preferredTarget.label}`}
          type="button"
        >
          <OpenInAppIcon appId={preferredTarget.id} sizeClass="size-[22px]" />
          <span>Open</span>
        </button>

        <Popover open={openInOpen} onOpenChange={setOpenInOpen}>
          <PopoverTrigger asChild>
            <button
              aria-label="Choose app"
              className="flex h-8 w-8 items-center justify-center border-l border-[rgba(255,255,255,0.08)] bg-transparent text-[var(--muted-foreground)] transition-colors hover:bg-white/[0.035] hover:text-[var(--foreground)] disabled:cursor-default disabled:opacity-60"
              disabled={launchingTarget !== null}
              type="button"
            >
              <ChevronDown className="size-3.5" strokeWidth={2.4} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[18rem] rounded-[22px] border-white/10 bg-[rgba(28,28,30,0.96)] p-3 shadow-[0_20px_64px_rgba(0,0,0,0.4)] backdrop-blur-xl"
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
                    "flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left text-[14px] font-medium text-[var(--foreground)] transition-colors hover:bg-white/[0.05] disabled:cursor-default disabled:opacity-60",
                    target.id === preferredTarget.id && "bg-white/[0.03]",
                  )}
                  disabled={launchingTarget !== null}
                  key={target.id}
                  onClick={() => void handleOpenIn(target.id)}
                  type="button"
                >
                  <OpenInAppIcon appId={target.id} />
                  <span>{target.label}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
