import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconButton } from "@lifecycle/ui";
import { ChevronRight, FolderGit2, GitBranch, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useEffect, type MouseEvent, useState } from "react";
import {
  SHORTCUT_HANDLER_PRIORITY,
  useShortcutRegistration,
} from "@/app/shortcuts/shortcut-router";
import { getWorkspaceDisplayName } from "@/features/workspaces/lib/workspace-display";
import { WorkspaceNavToolbar } from "@/features/workspaces/navbar/workspace-nav-toolbar";
import { useWorkspaceToolbarSlot } from "@/features/workspaces/state/workspace-toolbar-context";
import { useWorkspace } from "@/store/hooks";

interface WorkspaceNavBarProps {
  activeWorkspaceId: string;
  repositoryName: string;
}

export function WorkspaceNavBar({ activeWorkspaceId, repositoryName }: WorkspaceNavBarProps) {
  const workspace = useWorkspace(activeWorkspaceId) ?? null;
  const toolbarSlot = useWorkspaceToolbarSlot(activeWorkspaceId);

  useShortcutRegistration({
    handler: () => {
      window.history.back();
    },
    id: "repository.go-back",
    priority: SHORTCUT_HANDLER_PRIORITY.repository,
  });

  useShortcutRegistration({
    handler: () => {
      window.history.forward();
    },
    id: "repository.go-forward",
    priority: SHORTCUT_HANDLER_PRIORITY.repository,
  });

  const [extensionPanelCollapsed, setExtensionPanelCollapsed] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      setExtensionPanelCollapsed((event as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    };

    window.addEventListener("lifecycle:extension-panel-state", handler);
    return () => window.removeEventListener("lifecycle:extension-panel-state", handler);
  }, []);

  const handleMouseDown = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || !isTauri()) {
      return;
    }

    if (
      (event.target as Element).closest(
        "a, button, input, textarea, select, [role='button'], [data-no-drag]",
      )
    ) {
      return;
    }

    event.preventDefault();

    if (event.detail >= 2) {
      void getCurrentWindow().toggleMaximize();
    } else {
      void getCurrentWindow()
        .startDragging()
        .catch(() => {});
    }
  };

  const WorkspaceIcon = workspace?.checkout_type === "root" ? FolderGit2 : GitBranch;

  return (
    <header
      className="flex h-10 shrink-0 items-stretch gap-0 border-b border-[var(--border)] px-0"
      data-slot="workspace-nav-bar"
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
    >
      {/* Breadcrumb: Repository > Workspace */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2">
        <span className="truncate text-[13px] font-medium text-[var(--muted-foreground)]">
          {repositoryName}
        </span>
        {workspace ? (
          <>
            <ChevronRight
              className="size-3.5 shrink-0 text-[var(--muted-foreground)]"
              strokeWidth={1.5}
            />
            <WorkspaceIcon className="size-3.5 shrink-0 text-[var(--foreground)]" strokeWidth={2} />
            <span className="truncate text-[13px] font-medium text-[var(--foreground)]">
              {getWorkspaceDisplayName(workspace)}
            </span>
          </>
        ) : null}
      </div>

      {/* Toolbar actions (run, git) + trailing icons */}
      {toolbarSlot ? <WorkspaceNavToolbar slot={toolbarSlot} /> : null}
      <div className="flex shrink-0 items-center gap-1 pl-1 pr-2">
        <IconButton
          aria-label="Toggle extension panel"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("lifecycle:toggle-extension-panel"));
          }}
          title="Toggle extension panel"
        >
          {extensionPanelCollapsed ? (
            <PanelRightOpen size={16} strokeWidth={2} />
          ) : (
            <PanelRightClose size={16} strokeWidth={2} />
          )}
        </IconButton>
      </div>
    </header>
  );
}
