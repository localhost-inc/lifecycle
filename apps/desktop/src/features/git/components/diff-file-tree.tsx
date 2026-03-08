import { memo, useMemo, useState } from "react";
import { ChevronRight, Folder, File } from "lucide-react";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import { buildFileTree, type FileTreeNode } from "../lib/file-tree";

interface DiffFileTreeProps {
  activeFilePath: string | null;
  files: FileDiffMetadata[];
  onSelectFile: (path: string) => void;
  totalAdditions: number;
  totalDeletions: number;
}

function DiffFileTreeComponent({
  activeFilePath,
  files,
  onSelectFile,
  totalAdditions,
  totalDeletions,
}: DiffFileTreeProps) {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggleDir = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex min-h-11 items-center gap-2 border-b border-[var(--border)] px-3 py-3">
        <span className="text-xs font-semibold text-[var(--foreground)]">
          Files Changed
          <span className="ml-1.5 font-normal text-[var(--muted-foreground)]">{files.length}</span>
        </span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px]">
          {totalAdditions > 0 && (
            <span className="text-[var(--git-status-added)]">+{totalAdditions}</span>
          )}
          {totalDeletions > 0 && (
            <span className="text-[var(--git-status-deleted)]">-{totalDeletions}</span>
          )}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {tree.map((node) => (
          <TreeNodeRow
            key={node.path}
            activeFilePath={activeFilePath}
            collapsed={collapsed}
            depth={0}
            node={node}
            onSelectFile={onSelectFile}
            onToggleDir={toggleDir}
          />
        ))}
      </div>
    </div>
  );
}

export const DiffFileTree = memo(DiffFileTreeComponent);
DiffFileTree.displayName = "DiffFileTree";

interface TreeNodeRowProps {
  activeFilePath: string | null;
  collapsed: Set<string>;
  depth: number;
  node: FileTreeNode;
  onSelectFile: (path: string) => void;
  onToggleDir: (path: string) => void;
}

function TreeNodeRow({
  activeFilePath,
  collapsed,
  depth,
  node,
  onSelectFile,
  onToggleDir,
}: TreeNodeRowProps) {
  if (node.kind === "file") {
    const isActive = node.path === activeFilePath;
    return (
      <button
        type="button"
        className={`flex w-full items-center gap-1.5 py-1 pr-3 text-left text-xs transition-colors hover:bg-[var(--surface-hover)] ${isActive ? "bg-[var(--surface-selected)]" : ""}`}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
        onClick={() => onSelectFile(node.path)}
        title={node.path}
      >
        <File className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
        <span className="min-w-0 truncate font-mono text-[var(--foreground)]">{node.name}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[10px]">
          {node.additions > 0 && (
            <span className="text-[var(--git-status-added)]">+{node.additions}</span>
          )}
          {node.deletions > 0 && (
            <span className="text-[var(--git-status-deleted)]">-{node.deletions}</span>
          )}
        </span>
      </button>
    );
  }

  const isCollapsed = collapsed.has(node.path);
  return (
    <>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 py-1 pr-3 text-left text-xs transition-colors hover:bg-[var(--surface-hover)]"
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
        onClick={() => onToggleDir(node.path)}
        title={node.path}
      >
        <ChevronRight
          className={`h-2.5 w-2.5 shrink-0 text-[var(--muted-foreground)] transition-transform ${isCollapsed ? "" : "rotate-90"}`}
        />
        <Folder className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
        <span className="min-w-0 truncate font-mono text-[var(--muted-foreground)]">
          {node.name}
        </span>
      </button>
      {!isCollapsed &&
        node.children.map((child) => (
          <TreeNodeRow
            key={child.path}
            activeFilePath={activeFilePath}
            collapsed={collapsed}
            depth={depth + 1}
            node={child}
            onSelectFile={onSelectFile}
            onToggleDir={onToggleDir}
          />
        ))}
    </>
  );
}
