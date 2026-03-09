import { useState } from "react";
import { ExternalLink, GitFork, ChevronDown } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@lifecycle/ui";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { openWorkspaceInApp, type OpenInAppId } from "../../features/workspaces/api";

interface OpenInTarget {
  id: OpenInAppId;
  label: string;
}

const OPEN_IN_TARGETS: OpenInTarget[] = [
  { id: "cursor", label: "Cursor" },
  { id: "vscode", label: "VS Code" },
  { id: "zed", label: "Zed" },
  { id: "finder", label: "Finder" },
  { id: "terminal", label: "Terminal" },
];

const PREFERRED_EDITOR_KEY = "lifecycle.desktop.preferred-editor";

function getPreferredEditor(): OpenInAppId {
  if (typeof window === "undefined") return "cursor";
  return (localStorage.getItem(PREFERRED_EDITOR_KEY) as OpenInAppId) ?? "cursor";
}

function setPreferredEditor(appId: OpenInAppId): void {
  localStorage.setItem(PREFERRED_EDITOR_KEY, appId);
}

interface TitleBarActionsProps {
  workspace: WorkspaceRecord;
}

export function TitleBarActions({ workspace }: TitleBarActionsProps) {
  const [preferredEditor, setPreferred] = useState(getPreferredEditor);
  const [openInOpen, setOpenInOpen] = useState(false);

  const preferredTarget = OPEN_IN_TARGETS.find((t) => t.id === preferredEditor) ?? OPEN_IN_TARGETS[0]!;

  function handleOpenIn(appId: OpenInAppId) {
    void openWorkspaceInApp(workspace.id, appId);
    setOpenInOpen(false);
    if (appId !== "finder" && appId !== "terminal") {
      setPreferredEditor(appId);
      setPreferred(appId);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Fork button */}
      <button
        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-[11px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
        onClick={() => {
          // TODO: implement fork workspace
        }}
        type="button"
      >
        <GitFork className="h-3 w-3" strokeWidth={1.8} />
        <span>Fork</span>
      </button>

      {/* Open In split button */}
      <div className="flex items-center overflow-hidden rounded-md border border-[var(--border)]">
        <button
          className="flex items-center gap-1.5 bg-transparent px-2.5 py-1 text-[11px] text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)]"
          onClick={() => handleOpenIn(preferredEditor)}
          title={`Open in ${preferredTarget.label}`}
          type="button"
        >
          <ExternalLink className="h-3 w-3" strokeWidth={1.8} />
          <span>{preferredTarget.label}</span>
        </button>

        <Popover open={openInOpen} onOpenChange={setOpenInOpen}>
          <PopoverTrigger asChild>
            <button
              className="flex items-center border-l border-[var(--border)] bg-transparent px-1.5 py-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              type="button"
            >
              <ChevronDown className="h-3 w-3" strokeWidth={2} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-40 p-1"
            side="bottom"
            sideOffset={6}
          >
            {OPEN_IN_TARGETS.map((target) => (
              <button
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12px] text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)]"
                key={target.id}
                onClick={() => handleOpenIn(target.id)}
                type="button"
              >
                {target.label}
                {target.id === preferredEditor && (
                  <span className="ml-auto text-[10px] text-[var(--muted-foreground)]">default</span>
                )}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
