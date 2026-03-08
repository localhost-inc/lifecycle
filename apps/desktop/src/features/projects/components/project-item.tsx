import type { ProjectRecord } from "@lifecycle/contracts";
import { cn, CollapsibleTrigger, SidebarMenuAction, sidebarMenuButtonVariants } from "@lifecycle/ui";
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
        className={cn(sidebarMenuButtonVariants({ active: selected }), "pr-8")}
        onClick={onSelect}
      >
        <FolderClosed size={16} className="shrink-0 group-data-[state=open]/project:hidden" />
        <FolderOpen size={16} className="hidden shrink-0 group-data-[state=open]/project:block" />
        <span className="truncate">{project.name}</span>
      </CollapsibleTrigger>
      <SidebarMenuAction
        onClick={(e) => {
          e.stopPropagation();
          onCreateWorkspace();
        }}
        showOnHover
        title="New workspace"
      >
        <Plus size={12} />
      </SidebarMenuAction>
    </div>
  );
}
