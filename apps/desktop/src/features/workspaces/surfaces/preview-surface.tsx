import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@lifecycle/ui";
import { ExternalLink, Globe, RefreshCw } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { useWorkspacePaneRenderCount } from "@/features/workspaces/canvas/workspace-pane-performance";

interface PreviewSurfaceProps {
  tabKey: string;
  title: string;
  url: string;
}

export const PreviewSurface = memo(function PreviewSurface({ tabKey, title, url }: PreviewSurfaceProps) {
  useWorkspacePaneRenderCount("PreviewSurface", tabKey);
  const [reloadNonce, setReloadNonce] = useState(0);
  const iframeKey = useMemo(() => `${tabKey}:${reloadNonce}`, [reloadNonce, tabKey]);

  const openExternal = useCallback(() => {
    if (isTauri()) {
      void openUrl(url);
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }, [url]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-[var(--background)]"
      data-slot="preview-surface"
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
          aria-label="Reload preview"
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

      <div className="min-h-0 flex-1">
        <iframe
          key={iframeKey}
          className="h-full w-full border-0 bg-[var(--background)]"
          src={url}
          title={title}
        />
      </div>
    </div>
  );
});
