import { resolve } from "node:path";

function lifecycleRunPath(): string {
  const root =
    process.env.LIFECYCLE_ROOT ??
    resolve(process.env.HOME ?? process.env.USERPROFILE ?? "/tmp", ".lifecycle");
  return resolve(root, "run");
}

export function supervisorSocketPath(): string {
  return resolve(lifecycleRunPath(), "supervisor.sock");
}

export function supervisorPidPath(): string {
  return resolve(lifecycleRunPath(), "supervisor.pid");
}

export function workspaceLogDir(workspaceHash: string): string {
  return resolve(lifecycleRunPath(), "workspaces", workspaceHash, "logs");
}

/**
 * Stable short hash of a workspace path for filesystem scoping.
 */
export function hashWorkspacePath(workspacePath: string): string {
  const hash = Bun.hash(workspacePath);
  return hash.toString(16).slice(0, 12);
}
