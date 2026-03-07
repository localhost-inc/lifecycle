import type { ProjectRecord } from "@lifecycle/contracts";
import { CollapsibleTrigger } from "@lifecycle/ui";
import { FolderClosed, FolderOpen, Plus } from "lucide-react";

interface ProjectItemProps {
  project: ProjectRecord;
  selected: boolean;
  onSelect: () => void;
  onCreateWorkspace: () => void;
}

export function ProjectItem({
  project,
  selected,
  onSelect,
  onCreateWorkspace,
}: ProjectItemProps) {
  return (
    <div className="group flex w-full items-center">
      <CollapsibleTrigger
        onClick={onSelect}
        className={`flex flex-1 items-center gap-2 px-2 py-1 text-left transition-colors ${
          selected
            ? "text-[var(--foreground)]"
            : "text-[var(--sidebar-muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
        }`}
      >
        <FolderClosed size={14} className="shrink-0 group-data-[state=open]/project:hidden" />
        <FolderOpen size={14} className="hidden shrink-0 group-data-[state=open]/project:block" />
        <span className="truncate text-[13px] font-medium">{project.name}</span>
      </CollapsibleTrigger>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onCreateWorkspace();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            onCreateWorkspace();
          }
        }}
        className="mr-2 flex h-5 w-5 items-center justify-center text-[var(--muted-foreground)] opacity-0 transition-all hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] group-hover:opacity-100"
        title="New workspace"
      >
        <Plus size={12} />
      </span>
    </div>
  );
}
