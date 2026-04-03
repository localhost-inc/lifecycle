import React, { useState, useEffect } from "react"
import { gitCmd, tryLifecycleJson } from "../lib/cli.js"
import { Button } from "./button.js"

// ---------------------------------------------------------------------------
// Sidebar header — org display
// ---------------------------------------------------------------------------

interface SidebarHeaderProps {
  org: string
}

export function SidebarHeader({ org }: SidebarHeaderProps) {
  return (
    <box height={1} flexDirection="row">
      <text fg="white"><b>{` ${org}`}</b></text>
    </box>
  )
}

// ---------------------------------------------------------------------------
// Git action summary (TUI-simplified, no PR support yet)
// ---------------------------------------------------------------------------

interface GitActionSummary {
  branch: string | null
  label: string
  fg: string
  bg: string
}

function computeGitAction(cwd: string | null): GitActionSummary {
  const empty: GitActionSummary = { branch: null, label: "", fg: "gray", bg: "" }
  if (!cwd) return empty

  const branch = gitCmd(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])
  if (!branch) return empty

  const porcelain = gitCmd(cwd, ["status", "--porcelain"]) ?? ""
  const lines = porcelain.split("\n").filter(Boolean)

  let hasStagedChanges = false
  let hasUnstagedChanges = false
  for (const line of lines) {
    const x = line[0]
    const y = line[1]
    if (x !== " " && x !== "?") hasStagedChanges = true
    if (x === "?" && y === "?") hasUnstagedChanges = true
    else if (y !== " ") hasUnstagedChanges = true
  }

  if (lines.length > 0 && !hasStagedChanges) {
    return { branch, label: "Stage", fg: "black", bg: "yellow" }
  }

  // Check remote sync for push/behind state
  const counts = gitCmd(cwd, [
    "rev-list",
    "--left-right",
    "--count",
    "HEAD...@{upstream}",
  ])
  let ahead = 0
  let behind = 0
  if (counts) {
    const parts = counts.split(/\s+/)
    ahead = parseInt(parts[0], 10) || 0
    behind = parseInt(parts[1], 10) || 0
  }

  if (hasStagedChanges) {
    return {
      branch,
      label: behind === 0 ? "Commit & Push" : "Commit",
      fg: "black",
      bg: "cyan",
    }
  }

  // Clean working tree
  if (ahead > 0 && behind > 0) return { branch, label: "Diverged", fg: "black", bg: "yellow" }
  if (ahead > 0) return { branch, label: "Push", fg: "black", bg: "green" }
  if (behind > 0) return { branch, label: "Pull", fg: "black", bg: "yellow" }

  return empty
}

// ---------------------------------------------------------------------------
// Stack summary
// ---------------------------------------------------------------------------

interface StackStatusPayload {
  services: Array<{ name: string; status: string }>
}

interface StackSummary {
  total: number
  running: number
}

function computeStackSummary(cwd: string | null): StackSummary {
  if (!cwd) return { total: 0, running: 0 }
  const payload = tryLifecycleJson<StackStatusPayload>([
    "stack",
    "status",
    "--cwd",
    cwd,
  ])
  if (!payload) return { total: 0, running: 0 }
  const running = payload.services.filter(
    (s) => s.status === "ready" || s.status === "running",
  ).length
  return { total: payload.services.length, running }
}

// ---------------------------------------------------------------------------
// Route header — workspace title + git action + stack indicator
// ---------------------------------------------------------------------------

interface RouteHeaderProps {
  repoName: string | null
  workspaceName: string
  cwd: string | null
  onGitAction?: () => void
}

const GIT_POLL_INTERVAL = 3_000
const STACK_POLL_INTERVAL = 5_000

export function RouteHeader({
  repoName,
  workspaceName,
  cwd,
  onGitAction,
}: RouteHeaderProps) {
  const [gitAction, setGitAction] = useState<GitActionSummary>({
    branch: null,
    label: "",
    fg: "gray",
    bg: "",
  })
  const [stack, setStack] = useState<StackSummary>({ total: 0, running: 0 })

  useEffect(() => {
    const poll = () => setGitAction(computeGitAction(cwd))
    poll()
    const id = setInterval(poll, GIT_POLL_INTERVAL)
    return () => clearInterval(id)
  }, [cwd])

  useEffect(() => {
    const poll = () => setStack(computeStackSummary(cwd))
    poll()
    const id = setInterval(poll, STACK_POLL_INTERVAL)
    return () => clearInterval(id)
  }, [cwd])

  return (
    <box height={1} flexDirection="row">
      <text content=" " />
      {repoName ? (
        <>
          <text fg="gray">{repoName}</text>
          <text fg="gray">{" - "}</text>
          <text fg="white">
            <b>{workspaceName}</b>
          </text>
        </>
      ) : (
        <text fg="white">
          <b>{workspaceName}</b>
        </text>
      )}
      <box flexGrow={1} />
      {gitAction.label ? (
        <Button label={gitAction.label} bg={gitAction.bg} fg={gitAction.fg} onPress={onGitAction} />
      ) : null}
      {stack.total > 0 && (
        <>
          {gitAction.label && <text content=" " />}
          <Button
            label={stack.running > 0 ? `▶ ${stack.running}` : `■ ${stack.total}`}
            bg={stack.running > 0 ? "green" : "#555555"}
            fg={stack.running > 0 ? "black" : "white"}
          />
        </>
      )}
      <text content=" " />
    </box>
  )
}
