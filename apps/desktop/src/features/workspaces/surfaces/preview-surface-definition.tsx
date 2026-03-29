import { Globe } from "lucide-react";
import { PreviewSurface } from "@/features/workspaces/surfaces/preview-surface";
import { WorkspaceSurfaceBubble } from "@/features/workspaces/surfaces/workspace-surface-tab-icons";
import {
  getOptionalString,
  isRecord,
} from "@/features/workspaces/surfaces/workspace-surface-persistence-utils";
import type { WorkspaceSurfaceDefinition } from "@/features/workspaces/surfaces/workspace-surface-types";
import {
  createPreviewTab,
  previewTabKey,
  type PreviewTab,
} from "@/features/workspaces/surfaces/workspace-surface-tab-records";

export const previewSurfaceDefinition: WorkspaceSurfaceDefinition<"preview"> = {
  areActiveSurfacesEqual: (previous, next) => previous.tab === next.tab,
  buildTabPresentation: (tab) => ({
    leading: (
      <WorkspaceSurfaceBubble tab={tab}>
        <Globe className="h-3.5 w-3.5" strokeWidth={1.8} />
      </WorkspaceSurfaceBubble>
    ),
    title: tab.url,
  }),
  createTab: (options) =>
    createPreviewTab({
      key: options.previewKey,
      label: options.label,
      url: options.url,
    }),
  getTabKey: (options) => previewTabKey(options.previewKey),
  parsePersistedTab: parsePersistedPreviewTab,
  renderActiveSurface: (activeSurface) => (
    <PreviewSurface
      tabKey={activeSurface.tab.key}
      title={activeSurface.tab.label}
      url={activeSurface.tab.url}
      workspaceId={activeSurface.workspaceId}
    />
  ),
  resolveActiveSurface: (tab, context) => ({
    kind: "preview",
    tab,
    workspaceId: context.workspaceId,
  }),
  serializeTab: serializePreviewTab,
};

export function parsePersistedPreviewTab(value: unknown): PreviewTab | null {
  if (!isRecord(value)) {
    return null;
  }

  const key = getOptionalString(value, "key");
  const label = getOptionalString(value, "label");
  const url = getOptionalString(value, "url");
  if (!key || !label || !url) {
    return null;
  }

  return createPreviewTab({ key, label, url });
}

export function serializePreviewTab(tab: PreviewTab): Record<string, unknown> {
  const persistedKey = tab.key.startsWith("preview:") ? tab.key.slice("preview:".length) : tab.key;

  return {
    key: persistedKey,
    kind: tab.kind,
    label: tab.label,
    url: tab.url,
  };
}
