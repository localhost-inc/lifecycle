import React, { useState, useCallback } from "react"
import { useDialogKeyboard } from "@opentui-ui/dialog/react"
import { Checkbox } from "@opentui-ui/react/checkbox"
import { spawnSync } from "node:child_process"
import { gitCmd } from "../lib/cli.js"
import { Button } from "./button.js"

// ---------------------------------------------------------------------------
// Git command helpers
// ---------------------------------------------------------------------------

function gitStageAll(cwd: string): { ok: boolean; error?: string } {
  const r = spawnSync("git", ["add", "-A"], {
    cwd,
    encoding: "utf-8",
    timeout: 10_000,
  })
  if (r.status === 0) return { ok: true }
  return { ok: false, error: r.stderr?.trim() || "Stage failed" }
}

function gitCommit(
  cwd: string,
  message: string,
): { ok: boolean; error?: string } {
  const r = spawnSync("git", ["commit", "-m", message], {
    cwd,
    encoding: "utf-8",
    timeout: 10_000,
  })
  if (r.status === 0) return { ok: true }
  return { ok: false, error: r.stderr?.trim() || "Commit failed" }
}

function gitPush(cwd: string): { ok: boolean; error?: string } {
  const r = spawnSync("git", ["push"], {
    cwd,
    encoding: "utf-8",
    timeout: 30_000,
  })
  if (r.status === 0) return { ok: true }

  const stderr = r.stderr?.trim() ?? ""
  if (stderr.includes("no upstream") || stderr.includes("set-upstream")) {
    const branch = gitCmd(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])
    if (branch) {
      const r2 = spawnSync("git", ["push", "-u", "origin", branch], {
        cwd,
        encoding: "utf-8",
        timeout: 30_000,
      })
      if (r2.status === 0) return { ok: true }
      return { ok: false, error: r2.stderr?.trim() || "Push failed" }
    }
  }

  return { ok: false, error: stderr || "Push failed" }
}

// ---------------------------------------------------------------------------
// Phase resolution from working tree state
// ---------------------------------------------------------------------------

type Phase = "stage" | "commit" | "push" | "clean"

interface GitSnapshot {
  phase: Phase
  branch: string
  ahead: number
  behind: number
  stagedCount: number
  unstagedCount: number
  insertions: number
  deletions: number
}

function snapshot(cwd: string): GitSnapshot {
  const branch = gitCmd(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]) ?? ""
  const porcelain = gitCmd(cwd, ["status", "--porcelain"]) ?? ""
  const lines = porcelain.split("\n").filter(Boolean)

  let stagedCount = 0
  let unstagedCount = 0
  for (const line of lines) {
    const x = line[0]
    const y = line[1]
    if (x !== " " && x !== "?") stagedCount++
    if (x === "?" && y === "?") unstagedCount++
    else if (y !== " " && y !== undefined) unstagedCount++
  }

  let insertions = 0
  let deletions = 0
  const stat = gitCmd(cwd, ["diff", "--cached", "--shortstat"])
  if (stat) {
    const ins = stat.match(/(\d+) insertion/)
    const del = stat.match(/(\d+) deletion/)
    if (ins) insertions = parseInt(ins[1], 10)
    if (del) deletions = parseInt(del[1], 10)
  }

  let ahead = 0
  let behind = 0
  const counts = gitCmd(cwd, [
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

  let phase: Phase
  if (lines.length > 0 && stagedCount === 0) phase = "stage"
  else if (stagedCount > 0) phase = "commit"
  else if (ahead > 0) phase = "push"
  else phase = "clean"

  return {
    phase,
    branch,
    ahead,
    behind,
    stagedCount,
    unstagedCount,
    insertions,
    deletions,
  }
}

// ---------------------------------------------------------------------------
// GitActionDialogContent — rendered inside the library's dialog container
// ---------------------------------------------------------------------------

interface GitActionDialogContentProps {
  cwd: string
  dialogId: number | string
  onClose: () => void
}

export function GitActionDialogContent({
  cwd,
  dialogId,
  onClose,
}: GitActionDialogContentProps) {
  const [state, setState] = useState(() => snapshot(cwd))
  const [commitMsg, setCommitMsg] = useState("")
  const [pushAfterCommit, setPushAfterCommit] = useState(true)
  const [includeUnstaged, setIncludeUnstaged] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setState(snapshot(cwd))
    setError(null)
  }, [cwd])

  const handleContinue = useCallback(() => {
    setError(null)

    switch (state.phase) {
      case "stage": {
        const r = gitStageAll(cwd)
        if (!r.ok) {
          setError(r.error ?? "Stage failed")
          return
        }
        refresh()
        break
      }
      case "commit": {
        const msg = commitMsg.trim()
        if (!msg) return
        if (includeUnstaged) {
          const sr = gitStageAll(cwd)
          if (!sr.ok) {
            setError(sr.error ?? "Stage failed")
            return
          }
        }
        const r = gitCommit(cwd, msg)
        if (!r.ok) {
          setError(r.error ?? "Commit failed")
          return
        }
        if (pushAfterCommit) {
          const pr = gitPush(cwd)
          if (!pr.ok) {
            setError(pr.error ?? "Push failed")
            refresh()
            return
          }
        }
        onClose()
        break
      }
      case "push": {
        const r = gitPush(cwd)
        if (!r.ok) {
          setError(r.error ?? "Push failed")
          return
        }
        onClose()
        break
      }
      case "clean":
        onClose()
        break
    }
  }, [state.phase, cwd, commitMsg, pushAfterCommit, includeUnstaged, onClose, refresh])

  useDialogKeyboard(
    (key) => {
      if (key.name === "return" || key.name === "enter") {
        handleContinue()
      }
    },
    dialogId,
  )

  let title: string
  let actionLabel: string
  switch (state.phase) {
    case "stage":
      title = "Stage changes"
      actionLabel = "Stage All"
      break
    case "commit":
      title = "Commit staged changes"
      actionLabel = pushAfterCommit ? "Commit & Push" : "Commit"
      break
    case "push":
      title = "Push to remote"
      actionLabel = "Push"
      break
    case "clean":
      title = "Up to date"
      actionLabel = "Close"
      break
  }

  return (
    <box flexDirection="column">
      <text fg="white">
        <b>{title}</b>
      </text>
      <box height={1} />

      {state.branch !== "" && (
        <box flexDirection="row">
          <text fg="gray">{"Branch  "}</text>
          <text fg="white">
            <b>{state.branch}</b>
          </text>
        </box>
      )}

      {state.phase === "stage" && (
        <text fg="gray">
          {`${state.unstagedCount} ${state.unstagedCount === 1 ? "file" : "files"} with unstaged changes`}
        </text>
      )}

      {state.phase === "commit" && (
        <>
          <box flexDirection="row">
            <text fg="gray">{"Changes "}</text>
            <text fg="white">
              {`${state.stagedCount} ${state.stagedCount === 1 ? "file" : "files"}`}
            </text>
            {(state.insertions > 0 || state.deletions > 0) && (
              <text>
                {"  "}
                {state.insertions > 0 && (
                  <span fg="green">{`+${state.insertions}`}</span>
                )}
                {state.insertions > 0 && state.deletions > 0 && (
                  <span fg="gray">{" "}</span>
                )}
                {state.deletions > 0 && (
                  <span fg="red">{`-${state.deletions}`}</span>
                )}
              </text>
            )}
          </box>
          <box height={1} />
          <input
            value={commitMsg}
            onChange={setCommitMsg}
            placeholder="Commit message..."
            focused
            width={44}
            backgroundColor="#2a2a4e"
            textColor="#FFFFFF"
            focusedBackgroundColor="#333366"
          />
          <box height={1} />
          {state.unstagedCount > 0 && (
            <Checkbox
              checked={includeUnstaged}
              onCheckedChange={setIncludeUnstaged}
              label="Include unstaged changes"
            />
          )}
          <Checkbox
            checked={pushAfterCommit}
            onCheckedChange={setPushAfterCommit}
            label="Push after commit"
          />
        </>
      )}

      {state.phase === "push" && (
        <text fg="gray">
          {`${state.ahead} ${state.ahead === 1 ? "commit" : "commits"} ahead of remote`}
        </text>
      )}

      {state.phase === "clean" && (
        <text fg="green">{"Working tree clean, branch is up to date."}</text>
      )}

      {error && (
        <>
          <box height={1} />
          <text fg="red">{error}</text>
        </>
      )}

      <box height={1} />
      <box flexDirection="row">
        <box flexGrow={1} />
        <Button label="Cancel" bg="#555555" fg="white" onPress={onClose} />
        <text content=" " />
        <Button
          label={actionLabel}
          bg="cyan"
          fg="black"
          onPress={handleContinue}
        />
      </box>
    </box>
  )
}
