import type { ProjectRecord } from "@lifecycle/contracts";
import {
  cn,
  CollapsibleTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  sidebarMenuButtonVariants,
} from "@lifecycle/ui";
import { FolderClosed, FolderOpen, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";

interface ProjectItemProps {
  project: ProjectRecord;
  selected: boolean;
  onSelect: () => void;
  onCreateWorkspace: () => void;
  onRemoveProject: () => void;
}

export function ProjectItem({
  project,
  selected,
  onSelect,
  onCreateWorkspace,
  onRemoveProject,
}: ProjectItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="group/menu-item relative flex w-full items-center">
      <CollapsibleTrigger
        className={cn(sidebarMenuButtonVariants({ active: selected }), "pr-20")}
        onClick={onSelect}
      >
        <FolderClosed size={16} className="shrink-0 group-data-[state=open]/project:hidden" />
        <FolderOpen size={16} className="hidden shrink-0 group-data-[state=open]/project:block" />
        <span className="truncate">{project.name}</span>
      </CollapsibleTrigger>
      <div className="pointer-events-none absolute right-1 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/menu-item:pointer-events-auto group-hover/menu-item:opacity-100 group-focus-within/menu-item:pointer-events-auto group-focus-within/menu-item:opacity-100">
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded-md text-[var(--sidebar-muted-foreground)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]"
          onClick={(e) => {
            e.stopPropagation();
            onCreateWorkspace();
          }}
          title="New workspace"
        >
          <Plus size={14} strokeWidth={2} />
        </button>
        <Popover onOpenChange={setMenuOpen} open={menuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Project actions for ${project.name}`}
              className="flex size-6 items-center justify-center rounded-md text-[var(--sidebar-muted-foreground)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]"
              onClick={(event) => {
                event.stopPropagation();
              }}
              title="Project actions"
            >
              <MoreHorizontal size={14} strokeWidth={2} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-40 rounded-lg border-[var(--border)] bg-[var(--panel)] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
            side="bottom"
            sideOffset={8}
          >
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--sidebar-hover)]"
              onClick={() => {
                setMenuOpen(false);
                onRemoveProject();
              }}
            >
              Remove project
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
