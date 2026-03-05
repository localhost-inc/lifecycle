import type { ProjectRecord } from "@lifecycle/contracts";
import type { ManifestStatus } from "../api/projects";
import { StatusBadge } from "./status-badge";

interface ProjectItemProps {
  project: ProjectRecord;
  manifestState: ManifestStatus["state"];
  selected: boolean;
  onSelect: () => void;
  onCreateWorkspace: () => void;
}

export function ProjectItem({
  project,
  manifestState,
  selected,
  onSelect,
  onCreateWorkspace,
}: ProjectItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors ${
        selected
          ? "bg-[var(--surface-selected)] text-[var(--foreground)]"
          : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)]"
      }`}
    >
      <span className="truncate text-sm font-medium">{project.name}</span>
      <div className="flex items-center gap-1.5">
        <StatusBadge state={manifestState} />
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
          className="flex h-5 w-5 items-center justify-center rounded text-stone-400 opacity-0 transition-opacity hover:bg-stone-300 hover:text-stone-700 group-hover:opacity-100"
          title="New workspace"
        >
          +
        </span>
      </div>
    </button>
  );
}
