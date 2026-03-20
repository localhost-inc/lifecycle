import type { FileDiffMetadata } from "@pierre/diffs/react";
import { summarizeChanges } from "@/features/git/components/git-file-header";

export interface FileTreeLeaf {
  kind: "file";
  name: string;
  path: string;
  fileDiff: FileDiffMetadata;
  additions: number;
  deletions: number;
}

export interface FileTreeDirectory {
  kind: "directory";
  name: string;
  path: string;
  children: FileTreeNode[];
  additions: number;
  deletions: number;
}

export type FileTreeNode = FileTreeLeaf | FileTreeDirectory;

interface MutableDir {
  kind: "directory";
  name: string;
  path: string;
  children: Map<string, MutableDir | FileTreeLeaf>;
}

export function buildFileTree(files: FileDiffMetadata[]): FileTreeNode[] {
  const root: Map<string, MutableDir | FileTreeLeaf> = new Map();

  for (const fileDiff of files) {
    const { additions, deletions } = summarizeChanges(fileDiff);
    const parts = fileDiff.name.split("/");
    const fileName = parts.pop()!;

    let current = root;
    let pathSoFar = "";

    for (const part of parts) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
      let existing = current.get(part);
      if (!existing || existing.kind !== "directory") {
        const dir: MutableDir = {
          kind: "directory",
          name: part,
          path: pathSoFar,
          children: new Map(),
        };
        current.set(part, dir);
        existing = dir;
      }
      current = existing.children;
    }

    const leaf: FileTreeLeaf = {
      kind: "file",
      name: fileName,
      path: fileDiff.name,
      fileDiff,
      additions,
      deletions,
    };
    current.set(fileName, leaf);
  }

  return finalize(root);
}

function finalize(children: Map<string, MutableDir | FileTreeLeaf>): FileTreeNode[] {
  const result: FileTreeNode[] = [];

  for (const node of children.values()) {
    if (node.kind === "file") {
      result.push(node);
      continue;
    }

    let collapsed = collapseChain(node);
    const finalChildren = finalize(collapsed.children);
    let additions = 0;
    let deletions = 0;
    for (const child of finalChildren) {
      additions += child.additions;
      deletions += child.deletions;
    }

    result.push({
      kind: "directory",
      name: collapsed.name,
      path: collapsed.path,
      children: finalChildren,
      additions,
      deletions,
    });
  }

  return result;
}

function collapseChain(dir: MutableDir): MutableDir {
  while (dir.children.size === 1) {
    const only = dir.children.values().next().value!;
    if (only.kind !== "directory") {
      break;
    }
    dir = {
      kind: "directory",
      name: `${dir.name}/${only.name}`,
      path: only.path,
      children: only.children,
    };
  }
  return dir;
}
