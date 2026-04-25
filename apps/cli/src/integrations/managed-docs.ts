import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ManagedDocumentId = "agents-md" | "claude-md";
export type ManagedDocumentScope = "project" | "user";
export type ManagedDocumentInstallStatus = "created" | "updated" | "unchanged";
export type ManagedDocumentCheckStatus = "installed" | "missing" | "outdated";

export interface ManagedDocumentTarget {
  id: ManagedDocumentId;
  label: string;
  path: string;
  scope: ManagedDocumentScope;
}

const MANAGED_BLOCK_START = "<!-- lifecycle:managed:start -->";
const MANAGED_BLOCK_END = "<!-- lifecycle:managed:end -->";

const MANAGED_BLOCK_BODY = [
  "## Lifecycle workspace awareness",
  "",
  "This section is managed by `lifecycle install`. Do not edit it by hand.",
  "",
  "- Treat Lifecycle as the source of truth for workspace and runtime state.",
  "- Prefer `lifecycle context --json` for workspace facts.",
  "- Prefer `lifecycle stack status --json` and `lifecycle service info <service> --json` for managed service state.",
  "- Local previews may be available at `http://*.lifecycle.localhost/` through the Lifecycle bridge.",
].join("\n");

const MANAGED_BLOCK = `${MANAGED_BLOCK_START}\n${MANAGED_BLOCK_BODY}\n${MANAGED_BLOCK_END}`;

const MANAGED_DOCUMENT_TARGETS: readonly {
  id: ManagedDocumentId;
  label: string;
}[] = [
  {
    id: "agents-md",
    label: "AGENTS.md managed block",
  },
  {
    id: "claude-md",
    label: "CLAUDE.md managed block",
  },
] as const;

export function resolveManagedDocumentTargets(options: {
  homeDir?: string;
  projectPath?: string;
  scope: ManagedDocumentScope;
}): ManagedDocumentTarget[] {
  const basePath =
    options.scope === "user"
      ? path.resolve(options.homeDir ?? os.homedir())
      : path.resolve(options.projectPath ?? process.cwd());

  return MANAGED_DOCUMENT_TARGETS.map((target) => ({
    ...target,
    path: path.join(basePath, target.id === "agents-md" ? "AGENTS.md" : "CLAUDE.md"),
    scope: options.scope,
  }));
}

export function checkManagedDocumentTarget(
  target: ManagedDocumentTarget,
): ManagedDocumentCheckStatus {
  return evaluateManagedDocumentTarget(target).status;
}

export function installManagedDocumentTarget(
  target: ManagedDocumentTarget,
): ManagedDocumentInstallStatus {
  const snapshot = evaluateManagedDocumentTarget(target);
  if (!snapshot.nextContent) {
    return "unchanged";
  }

  writeFile(target.path, snapshot.nextContent);
  return snapshot.fileExists ? "updated" : "created";
}

function evaluateManagedDocumentTarget(target: ManagedDocumentTarget): {
  fileExists: boolean;
  nextContent: string | null;
  status: ManagedDocumentCheckStatus;
} {
  const raw = readFileOrNull(target.path);
  const nextContent = upsertManagedBlock(raw);
  if (raw === nextContent) {
    return {
      fileExists: raw !== null,
      nextContent: null,
      status: "installed",
    };
  }

  const hasManagedBlock =
    raw !== null && raw.includes(MANAGED_BLOCK_START) && raw.includes(MANAGED_BLOCK_END);

  return {
    fileExists: raw !== null,
    nextContent,
    status: hasManagedBlock ? "outdated" : "missing",
  };
}

function upsertManagedBlock(raw: string | null): string {
  if (raw === null || raw.trim().length === 0) {
    return `${MANAGED_BLOCK}\n`;
  }

  const startIndex = raw.indexOf(MANAGED_BLOCK_START);
  const endIndex = raw.indexOf(MANAGED_BLOCK_END);
  if (startIndex >= 0 && endIndex > startIndex) {
    const suffixIndex = endIndex + MANAGED_BLOCK_END.length;
    const before = raw.slice(0, startIndex).trimEnd();
    const after = raw.slice(suffixIndex).trim();
    const parts = [before, MANAGED_BLOCK, after].filter((value) => value.length > 0);
    return `${parts.join("\n\n")}\n`;
  }

  return `${raw.trimEnd()}\n\n${MANAGED_BLOCK}\n`;
}

function readFileOrNull(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

export const managedDocumentBlock = MANAGED_BLOCK;
