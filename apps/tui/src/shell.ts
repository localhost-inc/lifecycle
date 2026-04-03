import { spawnSync } from "node:child_process"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkspaceBinding = "bound" | "adhoc"
export type WorkspaceHost = "local" | "docker" | "cloud" | "remote" | "unknown"

export interface ServiceSummary {
  name: string
  previewUrl: string | null
  status: string
}

export interface WorkspaceScope {
  binding: WorkspaceBinding
  workspaceId: string | null
  workspaceName: string
  repoName: string | null
  host: WorkspaceHost
  status: string | null
  sourceRef: string | null
  cwd: string | null
  worktreePath: string | null
  services: ServiceSummary[]
  resolutionNote: string | null
  resolutionError: string | null
}

export interface ShellLaunchSpec {
  program: string
  args: string[]
  cwd: string | null
  env: [string, string][]
}

export interface ShellRuntime {
  backendLabel: string
  launchError: string | null
  persistent: boolean
  sessionName: string | null
  prepare: ShellLaunchSpec | null
  spec: ShellLaunchSpec | null
}

export interface TuiSession {
  workspace: WorkspaceScope
  shell: ShellRuntime
}

// ---------------------------------------------------------------------------
// Environment variable keys
// ---------------------------------------------------------------------------

export const TUI_SESSION_ENV = "LIFECYCLE_TUI_SESSION"
export const TUI_WORKSPACE_CWD_ENV = "LIFECYCLE_TUI_WORKSPACE_CWD"
export const TUI_WORKSPACE_ID_ENV = "LIFECYCLE_TUI_WORKSPACE_ID"

// ---------------------------------------------------------------------------
// Shell runtime resolution
// ---------------------------------------------------------------------------

export function resolveShellRuntime(scope: WorkspaceScope): ShellRuntime {
  if (scope.resolutionError) {
    return {
      backendLabel: "unavailable",
      launchError: scope.resolutionError,
      persistent: false,
      sessionName: null,
      prepare: null,
      spec: null,
    }
  }

  const cwd = scope.cwd ?? scope.worktreePath
  const sessionName = buildTmuxSessionName(scope)

  switch (scope.host) {
    case "local":
      return buildLocalRuntime(scope, cwd, sessionName)
    case "cloud":
      return buildCloudRuntime(scope, sessionName)
    case "docker":
      return {
        backendLabel: "docker shell",
        launchError:
          "Docker workspace shells are not wired into an authoritative TUI attach path yet.",
        persistent: false,
        sessionName: null,
        prepare: null,
        spec: null,
      }
    case "remote":
      return {
        backendLabel: "remote shell",
        launchError:
          "Remote workspace shells are reserved in the contract but not implemented in the TUI yet.",
        persistent: false,
        sessionName: null,
        prepare: null,
        spec: null,
      }
    default:
      return {
        backendLabel: "unknown shell",
        launchError:
          "Lifecycle could not resolve a supported shell launch path for this workspace host.",
        persistent: false,
        sessionName: null,
        prepare: null,
        spec: null,
      }
  }
}

// ---------------------------------------------------------------------------
// Host-specific builders
// ---------------------------------------------------------------------------

function buildLocalRuntime(
  scope: WorkspaceScope,
  cwd: string | null,
  sessionName: string,
): ShellRuntime {
  if (!commandAvailable("tmux")) {
    return {
      backendLabel: "local tmux",
      launchError:
        "tmux is required for the Lifecycle TUI local shell. Install tmux or launch from an environment where tmux is available.",
      persistent: false,
      sessionName: null,
      prepare: null,
      spec: null,
    }
  }

  if (!cwd) {
    return {
      backendLabel: "local tmux",
      launchError:
        "Lifecycle could not resolve a local working directory for this TUI session.",
      persistent: false,
      sessionName: null,
      prepare: null,
      spec: null,
    }
  }

  const windowName = scope.binding === "adhoc" ? " -n shell" : ""
  const script = [
    `if ! tmux has-session -t '${sessionName}' 2>/dev/null; then`,
    `  tmux new-session -d -s '${sessionName}' -c '${cwd}'${windowName};`,
    `fi;`,
    `exec tmux attach-session -d -t '${sessionName}'`,
  ].join(" ")

  return {
    backendLabel: "local tmux",
    launchError: null,
    persistent: true,
    sessionName,
    prepare: null,
    spec: {
      program: "sh",
      args: ["-c", script],
      cwd,
      env: [["TERM", "xterm-256color"]],
    },
  }
}

function buildCloudRuntime(
  scope: WorkspaceScope,
  sessionName: string,
): ShellRuntime {
  if (!scope.workspaceId) {
    return {
      backendLabel: "cloud tmux",
      launchError: "Cloud TUI sessions require a bound workspace id.",
      persistent: false,
      sessionName: null,
      prepare: null,
      spec: null,
    }
  }

  return {
    backendLabel: "cloud tmux",
    launchError: null,
    persistent: true,
    sessionName,
    prepare: null,
    spec: {
      program: "lifecycle",
      args: [
        "workspace",
        "shell",
        scope.workspaceId,
        "--tmux-session",
        sessionName,
      ],
      cwd: null,
      env: [],
    },
  }
}

// ---------------------------------------------------------------------------
// Tmux session naming
// ---------------------------------------------------------------------------

export function buildTmuxSessionName(scope: WorkspaceScope): string {
  const hostSlug = truncateSlug(slugify(scope.host), 12)

  const identitySlug = scope.workspaceId
    ? slugify(scope.workspaceId)
    : slugify(
        scope.workspaceName.trim() ||
          scope.cwd?.split("/").pop() ||
          "workspace",
      )

  const repoSlug = scope.repoName ? slugify(scope.repoName) : null
  const wsSlug = truncateSlug(slugify(scope.workspaceName), 18)

  let readableSlug: string | null = null
  if (repoSlug) {
    readableSlug = wsSlug
      ? truncateSlug(`${repoSlug}-${wsSlug}`, 28)
      : truncateSlug(repoSlug, 18)
  } else if (wsSlug) {
    readableSlug = truncateSlug(wsSlug, 28)
  }

  return readableSlug
    ? `lc-${hostSlug}-${truncateSlug(identitySlug, 24)}-${readableSlug}`
    : `lc-${hostSlug}-${truncateSlug(identitySlug, 40)}`
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function commandAvailable(program: string): boolean {
  try {
    const result = spawnSync(program, ["-V"], {
      encoding: "utf-8",
      timeout: 5_000,
    })
    return result.status === 0
  } catch {
    return false
  }
}

function slugify(value: string): string {
  let out = ""
  let prevDash = false
  for (const ch of value) {
    if (/[a-zA-Z0-9]/.test(ch)) {
      out += ch.toLowerCase()
      prevDash = false
    } else if (!prevDash) {
      out += "-"
      prevDash = true
    }
  }
  const trimmed = out.replace(/^-+|-+$/g, "")
  return trimmed || "workspace"
}

function truncateSlug(value: string, maxLen: number): string {
  return value.slice(0, maxLen)
}
