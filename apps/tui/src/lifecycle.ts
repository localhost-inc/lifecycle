import { tryLifecycleJson } from "./lib/cli.js"
import {
  resolveShellRuntime,
  TUI_SESSION_ENV,
  TUI_WORKSPACE_CWD_ENV,
  TUI_WORKSPACE_ID_ENV,
  type TuiSession,
  type WorkspaceHost,
  type WorkspaceScope,
} from "./shell.js"

// ---------------------------------------------------------------------------
// CLI payload types
// ---------------------------------------------------------------------------

interface WorkspaceStatusPayload {
  services: Array<{
    name: string
    preview_url: string | null
    status: string
  }>
  workspace: {
    host: string
    id: string
    name: string
    source_ref: string
    status: string
    worktree_path: string | null
  }
}

interface CloudShellPayload {
  cwd: string | null
}

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

const WORKSPACE_ID_ENV = "LIFECYCLE_WORKSPACE_ID"
const WORKSPACE_PATH_ENV = "LIFECYCLE_WORKSPACE_PATH"
const REPO_NAME_ENV = "LIFECYCLE_REPO_NAME"

function envString(name: string): string | null {
  const value = process.env[name]?.trim()
  return value || null
}

function parseHost(value: string): WorkspaceHost {
  switch (value.trim().toLowerCase()) {
    case "local":
      return "local"
    case "docker":
      return "docker"
    case "cloud":
      return "cloud"
    case "remote":
      return "remote"
    default:
      return "unknown"
  }
}

// ---------------------------------------------------------------------------
// TUI session resolution
// ---------------------------------------------------------------------------

export function resolveTuiSession(): TuiSession {
  // Check for a serialized session in the environment
  const sessionJson = envString(TUI_SESSION_ENV)
  if (sessionJson) {
    try {
      return JSON.parse(sessionJson) as TuiSession
    } catch {
      // Fall through to manual resolution
    }
  }

  const workspace = resolveWorkspaceScope()
  const shell = resolveShellRuntime(workspace)
  return { workspace, shell }
}

// ---------------------------------------------------------------------------
// Workspace scope resolution
// ---------------------------------------------------------------------------

function resolveWorkspaceScope(): WorkspaceScope {
  const workspaceId =
    envString(TUI_WORKSPACE_ID_ENV) ?? envString(WORKSPACE_ID_ENV)
  const cwdHint =
    envString(TUI_WORKSPACE_CWD_ENV) ??
    envString(WORKSPACE_PATH_ENV) ??
    process.cwd()

  if (workspaceId) {
    return resolveBoundWorkspace(workspaceId, cwdHint)
  }
  return resolveAdHocWorkspace(cwdHint)
}

function resolveBoundWorkspace(
  workspaceId: string,
  cwdHint: string | null,
): WorkspaceScope {
  // Try cloud shell path first
  const cloud = tryLifecycleJson<CloudShellPayload>([
    "workspace",
    "shell",
    workspaceId,
  ])
  if (cloud) {
    const cwd = cloud.cwd ?? cwdHint
    return {
      binding: "bound",
      workspaceId,
      workspaceName: workspaceId,
      repoName: envString(REPO_NAME_ENV),
      host: "cloud",
      status: "active",
      sourceRef: null,
      cwd,
      worktreePath: cwd,
      services: [],
      resolutionNote:
        "Bound to the cloud workspace shell attach path for this workspace.",
      resolutionError: null,
    }
  }

  // Try workspace status
  const status = tryLifecycleJson<WorkspaceStatusPayload>([
    "workspace",
    "status",
    "--workspace-id",
    workspaceId,
  ])
  if (status) {
    return {
      binding: "bound",
      workspaceId: status.workspace.id,
      workspaceName: status.workspace.name,
      repoName: envString(REPO_NAME_ENV),
      host: parseHost(status.workspace.host),
      status: status.workspace.status,
      sourceRef: status.workspace.source_ref,
      cwd: status.workspace.worktree_path ?? cwdHint,
      worktreePath: status.workspace.worktree_path,
      services: status.services.map((s) => ({
        name: s.name,
        previewUrl: s.preview_url,
        status: s.status,
      })),
      resolutionNote:
        "Bound to the current workspace scope resolved through Lifecycle.",
      resolutionError: null,
    }
  }

  // Fallback to cwd
  if (cwdHint) {
    return {
      binding: "bound",
      workspaceId,
      workspaceName: workspaceId,
      repoName: envString(REPO_NAME_ENV),
      host: "local",
      status: null,
      sourceRef: null,
      cwd: cwdHint,
      worktreePath: cwdHint,
      services: [],
      resolutionNote:
        "Lifecycle could not read workspace metadata, so the TUI is using the bound workspace path from the environment.",
      resolutionError: null,
    }
  }

  return {
    binding: "bound",
    workspaceId,
    workspaceName: workspaceId,
    repoName: envString(REPO_NAME_ENV),
    host: "unknown",
    status: null,
    sourceRef: null,
    cwd: null,
    worktreePath: null,
    services: [],
    resolutionNote: null,
    resolutionError: `Lifecycle could not resolve a bound shell attach path for workspace "${workspaceId}". Launch the TUI from a Lifecycle workspace session or use \`lifecycle tui ${workspaceId}\` from an environment that can resolve that workspace.`,
  }
}

function resolveAdHocWorkspace(cwdHint: string | null): WorkspaceScope {
  const cwd = cwdHint ?? "."
  const workspaceName = cwd.split("/").pop() ?? "workspace"

  return {
    binding: "adhoc",
    workspaceId: null,
    workspaceName,
    repoName: envString(REPO_NAME_ENV),
    host: "local",
    status: null,
    sourceRef: null,
    cwd,
    worktreePath: cwd,
    services: [],
    resolutionNote:
      "Running in ad hoc local mode. Bind a Lifecycle workspace id to unify shell and workspace-side status.",
    resolutionError: null,
  }
}
