import React, { useState, useEffect } from "react"
import { gitCmd } from "../lib/cli.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitFileStatus {
  path: string
  status: string
}

interface GitCommitEntry {
  sha: string
  message: string
  author: string
  relativeTime: string
}

interface GitState {
  branch: string
  dirty: boolean
  ahead: number
  behind: number
  files: GitFileStatus[]
  commits: GitCommitEntry[]
}

type VcTab = "status" | "commits"

interface VcPanelProps {
  cwd: string | null
  focused: boolean
  collapsed: boolean
  height: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VcPanel({ cwd, focused, collapsed, height }: VcPanelProps) {
  const [activeTab, setActiveTab] = useState<VcTab>("status")
  const [git, setGit] = useState<GitState>({
    branch: "",
    dirty: false,
    ahead: 0,
    behind: 0,
    files: [],
    commits: [],
  })

  useEffect(() => {
    if (!cwd) {
      setGit({
        branch: "(no repo)",
        dirty: false,
        ahead: 0,
        behind: 0,
        files: [],
        commits: [],
      })
      return
    }
    refreshGit(cwd)
  }, [cwd])

  function refreshGit(dir: string) {
    const branch =
      gitCmd(dir, ["rev-parse", "--abbrev-ref", "HEAD"]) ?? "HEAD"
    const statusOutput = gitCmd(dir, ["status", "--porcelain"]) ?? ""
    const files = statusOutput
      .split("\n")
      .filter(Boolean)
      .map((line) => ({
        status: line.slice(0, 2).trim(),
        path: line.slice(3).trim(),
      }))

    let ahead = 0
    let behind = 0
    const counts = gitCmd(dir, [
      "rev-list",
      "--left-right",
      "--count",
      "HEAD...@{upstream}",
    ])
    if (counts) {
      const parts = counts.split(/\s+/)
      ahead = parseInt(parts[0], 10) || 0
      behind = parseInt(parts[1], 10) || 0
    }

    const logOutput =
      gitCmd(dir, [
        "log",
        "--oneline",
        "--format=%h\t%s\t%an\t%cr",
        "-10",
      ]) ?? ""
    const commits = logOutput
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, message, author, relativeTime] = line.split("\t")
        return { sha, message, author, relativeTime }
      })
      .filter((c) => c.sha && c.message)

    setGit({ branch, dirty: files.length > 0, ahead, behind, files, commits })
  }

  const icon = collapsed ? "▶" : "▼"
  const titleColor = focused ? "cyan" : "white"

  if (collapsed) {
    return (
      <box height={1}>
        <text content={` ${icon} `} fg="gray" />
        <text fg={titleColor}><b>Version Control</b></text>
      </box>
    )
  }

  const tabLabel =
    activeTab === "status" ? "[Status] Commits" : "Status [Commits]"

  return (
    <box flexDirection="column" height={height}>
      <box flexDirection="row">
        <text content={` ${icon} `} fg="gray" />
        <text fg={titleColor}><b>Version Control</b></text>
      </box>
      <text content={`   ${tabLabel}`} fg="gray" />
      <scrollbox flexGrow={1}>
        {activeTab === "status" ? (
          <StatusContent git={git} />
        ) : (
          <CommitsContent commits={git.commits} />
        )}
      </scrollbox>
    </box>
  )
}

function StatusContent({ git }: { git: GitState }) {
  const statusIcon = git.dirty ? "✗" : "✓"
  const statusColor = git.dirty ? "yellow" : "green"

  return (
    <box flexDirection="column">
      <box flexDirection="row">
        <text fg="white"><b>{git.branch}</b></text>
        <text content={` ${statusIcon}`} fg={statusColor} />
      </box>
      {(git.ahead > 0 || git.behind > 0) && (
        <text content={`↑${git.ahead} ↓${git.behind}`} fg="gray" />
      )}
      {git.files.length === 0 && !git.dirty && (
        <text content="Working tree clean" fg="gray" />
      )}
      {git.files.map((f, i) => {
        const color =
          f.status === "M"
            ? "yellow"
            : f.status === "A"
              ? "green"
              : f.status === "D"
                ? "red"
                : "gray"
        return (
          <box key={i} flexDirection="row">
            <text content={`${f.status.padEnd(3)}`} fg={color} />
            <text content={f.path} fg="gray" />
          </box>
        )
      })}
    </box>
  )
}

function CommitsContent({ commits }: { commits: GitCommitEntry[] }) {
  if (commits.length === 0) {
    return <text content="No commits" fg="gray" />
  }

  return (
    <box flexDirection="column">
      {commits.map((c, i) => (
        <box key={i} flexDirection="row">
          <text content={c.sha} fg="yellow" />
          <text content={` ${c.message} `} fg="white" />
          <text content={c.relativeTime} fg="gray" />
        </box>
      ))}
    </box>
  )
}
