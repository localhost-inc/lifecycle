import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { tryLifecycleJson } from "./lib/cli.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RepoSource = "local" | "cloud"

export interface SidebarWorkspace {
  id: string | null
  name: string
  status: string
  sourceRef: string
  host: string
  worktreePath: string | null
}

export interface SidebarRepo {
  name: string
  source: RepoSource
  path: string | null
  workspaces: SidebarWorkspace[]
  expanded: boolean
}

export type SidebarSelection =
  | { type: "repo"; index: number }
  | { type: "workspace"; repoIndex: number; wsIndex: number }

export type SidebarDialog =
  | { type: "newWorkspace"; repoIndex: number; input: string }
  | {
      type: "confirmDelete"
      repoIndex: number
      wsIndex: number
      message: string
    }
  | {
      type: "confirmDeleteRepo"
      repoIndex: number
      message: string
    }

// ---------------------------------------------------------------------------
// CLI payload types
// ---------------------------------------------------------------------------

interface RepoListPayload {
  repositories: Array<{
    name: string
    source: string
    path: string | null
    workspaces?: Array<{
      id?: string
      name: string
      host?: string
      status?: string
      ref?: string
      path?: string
    }>
  }>
}

interface ActivityPayload {
  workspaces: Array<{
    activity_at: number | null
    busy: boolean
    repo: string
    name: string
  }>
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

export function loadRepos(): SidebarRepo[] {
  const payload = tryLifecycleJson<RepoListPayload>(["repo", "list"])
  if (!payload) {
    return [
      {
        name: "(no repositories)",
        source: "local",
        path: null,
        workspaces: [],
        expanded: false,
      },
    ]
  }

  const repos: SidebarRepo[] = payload.repositories.map((repo) => ({
    name: repo.name,
    source: repo.source === "cloud" ? "cloud" : "local",
    path: repo.path,
    workspaces: (repo.workspaces ?? []).map((ws) => ({
      id: ws.id ?? null,
      name: ws.name,
      status: ws.status ?? "active",
      sourceRef: ws.ref ?? "",
      host: ws.host ?? "local",
      worktreePath: ws.path ?? null,
    })),
    expanded: true,
  }))

  if (repos.length === 0) {
    repos.push({
      name: "(no repositories)",
      source: "local",
      path: null,
      workspaces: [],
      expanded: false,
    })
  }

  return repos
}

// ---------------------------------------------------------------------------
// Workspace activity polling
// ---------------------------------------------------------------------------

export type WorkspaceActivity = "idle" | "busy" | "attention"

export function wsKey(repoName: string, wsName: string): string {
  return `${repoName}\t${wsName}`
}

export function pollWorkspaceActivity(): Map<
  string,
  { busy: boolean; activityAt: number | null }
> {
  const result = new Map<
    string,
    { busy: boolean; activityAt: number | null }
  >()
  const payload = tryLifecycleJson<ActivityPayload>(["tui", "activity"])
  if (!payload) return result

  for (const ws of payload.workspaces) {
    result.set(wsKey(ws.repo, ws.name), {
      busy: ws.busy,
      activityAt: ws.activity_at,
    })
  }
  return result
}

// ---------------------------------------------------------------------------
// Workspace creation / deletion via CLI
// ---------------------------------------------------------------------------

export function createWorkspace(
  name: string,
  repoPath: string | null,
): { ok: boolean; error?: string } {
  const args = ["workspace", "create", name, "--host", "local"]
  if (repoPath) {
    args.push("--repo-path", repoPath)
  }
  const result = spawnSync("lifecycle", args, {
    encoding: "utf-8",
    timeout: 15_000,
  })
  if (result.status === 0) return { ok: true }
  return {
    ok: false,
    error: result.stderr?.trim() || "Workspace creation failed.",
  }
}

export function archiveWorkspace(
  wsName: string,
  repoPath: string,
  force: boolean,
): { ok: boolean; needsConfirm: boolean } {
  const args = [
    "workspace",
    "archive",
    wsName,
    "--repo-path",
    repoPath,
    "--json",
  ]
  if (force) args.push("--force")

  const result = spawnSync("lifecycle", args, {
    encoding: "utf-8",
    timeout: 15_000,
  })
  if (result.status === 0) return { ok: true, needsConfirm: false }

  const stdout = result.stdout ?? ""
  if (stdout.includes("uncommitted_changes")) {
    return { ok: false, needsConfirm: true }
  }
  return { ok: false, needsConfirm: false }
}

// ---------------------------------------------------------------------------
// Folder picker (macOS)
// ---------------------------------------------------------------------------

export function openFolderPicker(): string | null {
  if (process.platform !== "darwin") return null

  const result = spawnSync(
    "osascript",
    [
      "-e",
      `set chosenFolder to choose folder with prompt "Select a repository folder"\nreturn POSIX path of chosenFolder`,
    ],
    { encoding: "utf-8", timeout: 60_000 },
  )

  if (result.status !== 0) return null
  const p = result.stdout?.trim()
  return p || null
}

export function removeRepo(repoPath: string): { ok: boolean; error?: string } {
  const result = spawnSync("lifecycle", ["repo", "remove", "--path", repoPath, "--json"], {
    encoding: "utf-8",
    timeout: 10_000,
  })
  if (result.status === 0) {
    return { ok: true }
  }
  const stderr = result.stderr?.trim()
  return { ok: false, error: stderr || "Failed to remove repository" }
}

export function addRepoViaPicker(): boolean {
  const folder = openFolderPicker()
  if (!folder) return false
  spawnSync("lifecycle", ["repo", "init", "--path", folder], {
    encoding: "utf-8",
  })
  return true
}

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

function stateFilePath(): string {
  return path.join(os.homedir(), ".lifecycle", "tui.json")
}

export function saveLastWorkspace(
  repoName: string,
  workspaceName: string,
): void {
  try {
    const dir = path.dirname(stateFilePath())
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      stateFilePath(),
      JSON.stringify({ last_repo: repoName, last_workspace: workspaceName }),
    )
  } catch {
    // Ignore write errors
  }
}

export function loadLastWorkspace(): {
  lastRepo: string
  lastWorkspace: string
} | null {
  try {
    const data = fs.readFileSync(stateFilePath(), "utf-8")
    const parsed = JSON.parse(data)
    return { lastRepo: parsed.last_repo, lastWorkspace: parsed.last_workspace }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

export function flatItems(
  repos: SidebarRepo[],
): SidebarSelection[] {
  const items: SidebarSelection[] = []
  for (let ri = 0; ri < repos.length; ri++) {
    items.push({ type: "repo", index: ri })
    if (repos[ri].expanded) {
      for (let wi = 0; wi < repos[ri].workspaces.length; wi++) {
        items.push({ type: "workspace", repoIndex: ri, wsIndex: wi })
      }
    }
  }
  return items
}

export function selectionEquals(
  a: SidebarSelection | null,
  b: SidebarSelection | null,
): boolean {
  if (!a || !b) return a === b
  if (a.type !== b.type) return false
  if (a.type === "repo" && b.type === "repo") return a.index === b.index
  if (a.type === "workspace" && b.type === "workspace")
    return a.repoIndex === b.repoIndex && a.wsIndex === b.wsIndex
  return false
}

export function moveSelection(
  repos: SidebarRepo[],
  current: SidebarSelection | null,
  direction: "up" | "down",
): SidebarSelection | null {
  const items = flatItems(repos)
  if (items.length === 0) return null

  const currentIdx = current
    ? items.findIndex((i) => selectionEquals(i, current))
    : -1

  if (direction === "down") {
    const next = currentIdx + 1 < items.length ? currentIdx + 1 : 0
    return items[next]
  } else {
    const prev = currentIdx <= 0 ? items.length - 1 : currentIdx - 1
    return items[prev]
  }
}
