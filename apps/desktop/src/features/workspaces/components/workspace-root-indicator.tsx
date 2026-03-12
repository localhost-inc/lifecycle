import { cn } from "@lifecycle/ui";
import { FolderGit2 } from "lucide-react";

interface WorkspaceRootIndicatorProps {
  className?: string;
}

export function WorkspaceRootIndicator({ className }: WorkspaceRootIndicatorProps) {
  return (
    <span
      aria-label="Root workspace"
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-[var(--muted-foreground)]",
        className,
      )}
      data-slot="workspace-root-indicator"
      title="Root workspace"
    >
      <FolderGit2 size={12} strokeWidth={2} />
    </span>
  );
}
