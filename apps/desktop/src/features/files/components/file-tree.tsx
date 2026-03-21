import { Alert, AlertDescription } from "@lifecycle/ui";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveFileTreeIcon } from "@/features/files/lib/file-tree-icons";
import type { WorkspaceFileTreeEntry } from "@/features/workspaces/api";

interface FileTreeProps {
  activeFilePath: string;
  entries: WorkspaceFileTreeEntry[] | undefined;
  error: unknown;
  isLoading: boolean;
  onOpenFile: (filePath: string) => void;
}

interface FileTreeLeaf {
  extension: string | null;
  kind: "file";
  name: string;
  path: string;
}

interface FileTreeDirectory {
  children: FileTreeNode[];
  kind: "directory";
  name: string;
  path: string;
}

type FileTreeNode = FileTreeDirectory | FileTreeLeaf;

interface MutableDirectoryNode {
  children: Map<string, MutableDirectoryNode | FileTreeLeaf>;
  kind: "directory";
  name: string;
  path: string;
}

function buildFileTree(entries: WorkspaceFileTreeEntry[]): FileTreeNode[] {
  const root = new Map<string, MutableDirectoryNode | FileTreeLeaf>();

  for (const entry of entries) {
    const parts = entry.file_path.split("/");
    const fileName = parts.pop();
    if (!fileName) {
      continue;
    }

    let current = root;
    let pathSoFar = "";

    for (const part of parts) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
      let existing = current.get(part);
      if (!existing || existing.kind !== "directory") {
        existing = {
          children: new Map(),
          kind: "directory",
          name: part,
          path: pathSoFar,
        };
        current.set(part, existing);
      }

      current = existing.children;
    }

    current.set(fileName, {
      extension: entry.extension,
      kind: "file",
      name: fileName,
      path: entry.file_path,
    });
  }

  return finalizeFileTree(root);
}

function collapseDirectoryChain(directory: MutableDirectoryNode): MutableDirectoryNode {
  let nextDirectory = directory;

  while (nextDirectory.children.size === 1) {
    const onlyChild = nextDirectory.children.values().next().value;
    if (!onlyChild || onlyChild.kind !== "directory") {
      break;
    }

    nextDirectory = {
      children: onlyChild.children,
      kind: "directory",
      name: `${nextDirectory.name}/${onlyChild.name}`,
      path: onlyChild.path,
    };
  }

  return nextDirectory;
}

function finalizeFileTree(
  children: Map<string, MutableDirectoryNode | FileTreeLeaf>,
): FileTreeNode[] {
  const result: FileTreeNode[] = [];

  for (const node of children.values()) {
    if (node.kind === "file") {
      result.push(node);
      continue;
    }

    const collapsed = collapseDirectoryChain(node);
    result.push({
      children: finalizeFileTree(collapsed.children),
      kind: "directory",
      name: collapsed.name,
      path: collapsed.path,
    });
  }

  return result.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "directory" ? -1 : 1;
    }

    return left.path.localeCompare(right.path);
  });
}

export function collectCollapsedDirectoryPaths(nodes: readonly FileTreeNode[]): Set<string> {
  const paths = new Set<string>();

  for (const node of nodes) {
    if (node.kind !== "directory") {
      continue;
    }

    paths.add(node.path);
    for (const childPath of collectCollapsedDirectoryPaths(node.children)) {
      paths.add(childPath);
    }
  }

  return paths;
}

export function reconcileCollapsedDirectoryPaths(
  previousCollapsedPaths: ReadonlySet<string>,
  previousDirectoryPaths: ReadonlySet<string>,
  nextDirectoryPaths: ReadonlySet<string>,
): Set<string> {
  const nextCollapsedPaths = new Set<string>();

  for (const path of nextDirectoryPaths) {
    if (!previousDirectoryPaths.has(path) || previousCollapsedPaths.has(path)) {
      nextCollapsedPaths.add(path);
    }
  }

  return nextCollapsedPaths;
}

function areSetsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

export function FileTree({
  activeFilePath,
  entries,
  error,
  isLoading,
  onOpenFile,
}: FileTreeProps) {
  const tree = useMemo(() => buildFileTree(entries ?? []), [entries]);
  const directoryPaths = useMemo(() => collectCollapsedDirectoryPaths(tree), [tree]);
  const previousDirectoryPathsRef = useRef<Set<string>>(directoryPaths);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set(directoryPaths));

  useEffect(() => {
    const previousDirectoryPaths = previousDirectoryPathsRef.current;
    const nextCollapsedPaths = reconcileCollapsedDirectoryPaths(
      collapsedPaths,
      previousDirectoryPaths,
      directoryPaths,
    );

    previousDirectoryPathsRef.current = directoryPaths;
    if (areSetsEqual(collapsedPaths, nextCollapsedPaths)) {
      return;
    }

    setCollapsedPaths(nextCollapsedPaths);
  }, [collapsedPaths, directoryPaths]);

  const toggleDirectory = (path: string) => {
    setCollapsedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col bg-[var(--surface)]">
      <div className="min-h-0 flex-1 overflow-auto py-2">
        {isLoading && !entries ? (
          <p className="px-3 text-xs text-[var(--muted-foreground)]">Loading workspace files...</p>
        ) : error ? (
          <Alert className="mx-3" variant="destructive">
            <AlertDescription>{String(error)}</AlertDescription>
          </Alert>
        ) : tree.length === 0 ? (
          <p className="px-3 text-xs text-[var(--muted-foreground)]">No files available.</p>
        ) : (
          tree.map((node) => (
            <FileTreeRow
              key={node.path}
              activeFilePath={activeFilePath}
              collapsedPaths={collapsedPaths}
              depth={0}
              node={node}
              onOpenFile={onOpenFile}
              onToggleDirectory={toggleDirectory}
            />
          ))
        )}
      </div>
    </aside>
  );
}

interface FileTreeRowProps {
  activeFilePath: string;
  collapsedPaths: Set<string>;
  depth: number;
  node: FileTreeNode;
  onOpenFile: (filePath: string) => void;
  onToggleDirectory: (path: string) => void;
}

function FileTreeRow({
  activeFilePath,
  collapsedPaths,
  depth,
  node,
  onOpenFile,
  onToggleDirectory,
}: FileTreeRowProps) {
  if (node.kind === "file") {
    const isActive = node.path === activeFilePath;
    const { Icon, name } = resolveFileTreeIcon(node.path, node.extension);

    return (
      <button
        className={`flex w-full items-center gap-2 py-1.5 pr-3 text-left text-xs transition-colors hover:bg-[var(--surface-hover)] ${
          isActive ? "bg-[var(--surface-selected)]" : ""
        }`}
        onClick={() => onOpenFile(node.path)}
        style={{ paddingLeft: `${depth * 1.25 + 0.75}rem` }}
        title={node.path}
        type="button"
      >
        <span
          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--muted-foreground)]"
          data-file-tree-icon={name}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 truncate font-mono text-[var(--foreground)]">{node.name}</span>
      </button>
    );
  }

  const isCollapsed = collapsedPaths.has(node.path);

  return (
    <>
      <button
        className="flex w-full items-center gap-2 py-1.5 pr-3 text-left text-xs transition-colors hover:bg-[var(--surface-hover)]"
        onClick={() => onToggleDirectory(node.path)}
        style={{ paddingLeft: `${depth * 1.25 + 0.75}rem` }}
        title={node.path}
        type="button"
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 text-[var(--muted-foreground)] transition-transform ${
            isCollapsed ? "" : "rotate-90"
          }`}
        />
        {isCollapsed ? (
          <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
        ) : (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
        )}
        <span className="min-w-0 truncate font-mono text-[var(--muted-foreground)]">
          {node.name}
        </span>
      </button>
      {!isCollapsed &&
        node.children.map((child) => (
          <FileTreeRow
            key={child.path}
            activeFilePath={activeFilePath}
            collapsedPaths={collapsedPaths}
            depth={depth + 1}
            node={child}
            onOpenFile={onOpenFile}
            onToggleDirectory={onToggleDirectory}
          />
        ))}
    </>
  );
}
