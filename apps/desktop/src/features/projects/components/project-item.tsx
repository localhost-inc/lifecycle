import type { ProjectRecord } from "@lifecycle/contracts";
import { cn, CollapsibleTrigger, sidebarMenuButtonVariants } from "@lifecycle/ui";
import { FolderClosed, FolderOpen, Plus } from "lucide-react";

interface ProjectItemProps {
  project: ProjectRecord;
  selected: boolean;
  onSelect: () => void;
  onCreateWorkspace: () => void;
}

export function ProjectItem({ project, selected, onSelect, onCreateWorkspace }: ProjectItemProps) {
  return (
    <div className="group/menu-item relative flex w-full items-center">
      <CollapsibleTrigger
        className={cn(sidebarMenuButtonVariants({ active: selected }), "pr-16")}
        onClick={onSelect}
      >
        <FolderClosed size={16} className="shrink-0 group-data-[state=open]/project:hidden" />
        <FolderOpen size={16} className="hidden shrink-0 group-data-[state=open]/project:block" />
        <span className="truncate">{project.name}</span>
      </CollapsibleTrigger>
      <div className="absolute right-1 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100">
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
      </div>
    </div>
  );
}
