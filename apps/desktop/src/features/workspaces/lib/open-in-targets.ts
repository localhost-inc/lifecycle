import type { OpenInAppId } from "@/features/workspaces/open-in-api";

export interface OpenInTarget {
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
  { id: "iterm", label: "iTerm2", macOnly: true },
  { id: "ghostty", label: "Ghostty", macOnly: true },
  { id: "warp", label: "Warp", macOnly: true },
  { id: "xcode", label: "Xcode", macOnly: true },
];

export function isSupportedOpenInAppId(value: string | null): value is OpenInAppId {
  return (
    value === "cursor" ||
    value === "finder" ||
    value === "ghostty" ||
    value === "iterm" ||
    value === "vscode" ||
    value === "warp" ||
    value === "windsurf" ||
    value === "xcode" ||
    value === "zed"
  );
}

export function listAvailableOpenInTargets(macPlatform: boolean): readonly OpenInTarget[] {
  return OPEN_IN_TARGETS.filter((target) => !target.macOnly || macPlatform);
}

export function resolveDefaultOpenTarget(availableTargets: readonly OpenInTarget[]): OpenInTarget {
  return (
    availableTargets.find((target) => target.id === DEFAULT_OPEN_TARGET) ?? availableTargets[0]!
  );
}
