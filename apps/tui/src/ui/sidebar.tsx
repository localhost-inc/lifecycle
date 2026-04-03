import React, { useState, useCallback } from "react"
import {
  type SidebarRepo,
  type SidebarSelection,
  type SidebarDialog,
  type WorkspaceActivity,
  wsKey,
  selectionEquals,
} from "../sidebar-state.js"

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

// ---------------------------------------------------------------------------
// Hover key: "repo-0", "ws-0-1", etc. null = nothing hovered.
// ---------------------------------------------------------------------------

interface SidebarProps {
  repos: SidebarRepo[]
  selected: SidebarSelection | null
  focused: boolean
  dialog: SidebarDialog | null
  spinnerFrame: number
  activity: Map<string, WorkspaceActivity>
  width: number
  onRepoClick?: (repoIndex: number) => void
  onRepoPlusClick?: (repoIndex: number) => void
  onWsClick?: (repoIndex: number, wsIndex: number) => void
  onWsArchiveClick?: (repoIndex: number, wsIndex: number) => void
  onAddRepoClick?: () => void
}

export function Sidebar({
  repos,
  selected,
  focused,
  dialog,
  spinnerFrame,
  activity,
  width,
  onRepoClick,
  onRepoPlusClick,
  onWsClick,
  onWsArchiveClick,
  onAddRepoClick,
}: SidebarProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const innerWidth = width

  return (
    <box
      flexDirection="column"
      height="100%"
    >
      {/* Header */}
      <box
        flexDirection="row"
        onMouseOver={() => setHovered("header")}
        onMouseOut={() => setHovered(null)}
        onMouseDown={() => onAddRepoClick?.()}
      >
        <text fg="white"><b>{" Repositories "}</b></text>
        <box flexGrow={1} />
        <text content=" [+] " fg={hovered === "header" ? "cyan" : "gray"} />
      </box>

      {/* Tree */}
      <box flexDirection="column" flexGrow={1}>
        {repos.map((repo, ri) => (
          <RepoGroup
            key={`repo-${ri}`}
            repo={repo}
            repoIndex={ri}
            selected={selected}
            focused={focused}
            dialog={dialog}
            spinnerFrame={spinnerFrame}
            activity={activity}
            innerWidth={innerWidth}
            hovered={hovered}
            setHovered={setHovered}
            onRepoClick={onRepoClick}
            onRepoPlusClick={onRepoPlusClick}
            onWsClick={onWsClick}
            onWsArchiveClick={onWsArchiveClick}
            isLast={ri === repos.length - 1}
          />
        ))}
      </box>
    </box>
  )
}

// ---------------------------------------------------------------------------
// Repo group: repo header + expanded workspace children
// ---------------------------------------------------------------------------

interface RepoGroupProps {
  repo: SidebarRepo
  repoIndex: number
  selected: SidebarSelection | null
  focused: boolean
  dialog: SidebarDialog | null
  spinnerFrame: number
  activity: Map<string, WorkspaceActivity>
  innerWidth: number
  hovered: string | null
  setHovered: (h: string | null) => void
  onRepoClick?: (ri: number) => void
  onRepoPlusClick?: (ri: number) => void
  onWsClick?: (ri: number, wi: number) => void
  onWsArchiveClick?: (ri: number, wi: number) => void
  isLast: boolean
}

function RepoGroup({
  repo,
  repoIndex: ri,
  selected,
  focused,
  dialog,
  spinnerFrame,
  activity,
  innerWidth,
  hovered,
  setHovered,
  onRepoClick,
  onRepoPlusClick,
  onWsClick,
  onWsArchiveClick,
  isLast,
}: RepoGroupProps) {
  const isRepoSelected = selectionEquals(selected, { type: "repo", index: ri })
  const isRepoHovered = hovered === `repo-${ri}`
  const icon = repo.expanded ? "▼" : "▶"
  const sourceTag = repo.source === "cloud" ? " ☁" : ""

  const repoFg =
    isRepoSelected && focused ? "cyan" : isRepoSelected ? "white" : "white"
  const showPlus = isRepoHovered || (isRepoSelected && focused)

  const label = `${icon} ${repo.name}${sourceTag}`
  // Pad to right-align the [+]
  const padLen = Math.max(0, innerWidth - label.length - 3)
  const plusText = showPlus ? `${" ".repeat(padLen)}[+]` : ""

  return (
    <>
      {/* Repo row */}
      <box
        flexDirection="row"
        onMouseOver={() => setHovered(`repo-${ri}`)}
        onMouseOut={() => setHovered(null)}
        onMouseDown={(e: any) => {
          // If click is in the [+] zone (right side), create workspace
          if (showPlus && e?.x != null && e.x >= innerWidth - 4) {
            onRepoPlusClick?.(ri)
          } else {
            onRepoClick?.(ri)
          }
        }}
      >
        {isRepoSelected ? (
          <text fg={repoFg}><b>{label + plusText}</b></text>
        ) : (
          <text fg={repoFg}>
            {label}
            {showPlus && (
              <span fg={isRepoHovered ? "cyan" : "gray"}>{plusText}</span>
            )}
          </text>
        )}
      </box>

      {/* Expanded children */}
      {repo.expanded && (
        <>
          {/* New workspace dialog */}
          {dialog?.type === "newWorkspace" && dialog.repoIndex === ri && (
            <box>
              <text fg="cyan">
                {dialog.input
                  ? `  + ${dialog.input}█`
                  : "  + █"}
                {!dialog.input && <span fg="gray">{"workspace name…"}</span>}
              </text>
            </box>
          )}

          {/* Workspace rows */}
          {repo.workspaces.map((ws, wi) => (
            <WorkspaceRow
              key={`ws-${ri}-${wi}`}
              repo={repo}
              ws={ws}
              repoIndex={ri}
              wsIndex={wi}
              selected={selected}
              focused={focused}
              spinnerFrame={spinnerFrame}
              activity={activity}
              innerWidth={innerWidth}
              hovered={hovered}
              setHovered={setHovered}
              onWsClick={onWsClick}
              onWsArchiveClick={onWsArchiveClick}
            />
          ))}

          {/* Empty state */}
          {repo.workspaces.length === 0 && repo.path && (
            <text content="  (no workspaces)" fg="gray" />
          )}

          {/* Confirm delete dialog */}
          {dialog?.type === "confirmDelete" && dialog.repoIndex === ri && (
            <text fg="yellow">{`  ${dialog.message}`}</text>
          )}
          {dialog?.type === "confirmDeleteRepo" && dialog.repoIndex === ri && (
            <text fg="yellow">{`  ${dialog.message}`}</text>
          )}
        </>
      )}

      {/* Gap between repos */}
      {!isLast && <text content="" />}
    </>
  )
}

// ---------------------------------------------------------------------------
// Workspace row with hover → [x] archive button
// ---------------------------------------------------------------------------

interface WorkspaceRowProps {
  repo: SidebarRepo
  ws: SidebarRepo["workspaces"][number]
  repoIndex: number
  wsIndex: number
  selected: SidebarSelection | null
  focused: boolean
  spinnerFrame: number
  activity: Map<string, WorkspaceActivity>
  innerWidth: number
  hovered: string | null
  setHovered: (h: string | null) => void
  onWsClick?: (ri: number, wi: number) => void
  onWsArchiveClick?: (ri: number, wi: number) => void
}

function WorkspaceRow({
  repo,
  ws,
  repoIndex: ri,
  wsIndex: wi,
  selected,
  focused,
  spinnerFrame,
  activity,
  innerWidth,
  hovered,
  setHovered,
  onWsClick,
  onWsArchiveClick,
}: WorkspaceRowProps) {
  const isWsSelected = selectionEquals(selected, {
    type: "workspace",
    repoIndex: ri,
    wsIndex: wi,
  })
  const hovKey = `ws-${ri}-${wi}`
  const isHovered = hovered === hovKey

  const key = wsKey(repo.name, ws.name)
  const wsActivity = activity.get(key) ?? "idle"

  let indicator: string
  let indicatorColor: string
  if (wsActivity === "busy") {
    indicator = SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length]
    indicatorColor = "cyan"
  } else if (wsActivity === "attention") {
    indicator = "●"
    indicatorColor = "yellow"
  } else {
    indicator = "●"
    indicatorColor =
      ws.status === "active"
        ? "green"
        : ws.status === "provisioning"
          ? "yellow"
          : ws.status === "failed"
            ? "red"
            : "gray"
  }

  const wsFg =
    isWsSelected && focused ? "cyan" : isWsSelected ? "white" : "gray"

  const prefix = `  ${indicator} ${ws.name}`
  const padLen = Math.max(0, innerWidth - prefix.length - 3)
  const archiveBtn = isHovered ? `${" ".repeat(padLen)}[x]` : ""

  return (
    <box
      flexDirection="row"
      onMouseOver={() => setHovered(hovKey)}
      onMouseOut={() => setHovered(null)}
      onMouseDown={(e: any) => {
        // If click is in [x] zone, archive
        if (isHovered && e?.x != null && e.x >= innerWidth - 4) {
          onWsArchiveClick?.(ri, wi)
        } else {
          onWsClick?.(ri, wi)
        }
      }}
    >
      <text content="  " />
      <text content={`${indicator} `} fg={indicatorColor} />
      <text content={ws.name} fg={wsFg} />
      {isHovered && (
        <text fg="red">{archiveBtn}</text>
      )}
    </box>
  )
}
