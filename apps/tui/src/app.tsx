import React, { useState, useEffect, useRef, useCallback } from "react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Sidebar } from "./ui/sidebar.js"
import { Canvas } from "./ui/canvas.js"
import { StatusBar } from "./ui/status-bar.js"
import { VcPanel } from "./ui/vc-panel.js"
import { StackPanel } from "./ui/stack-panel.js"
import { SidebarHeader, RouteHeader } from "./ui/header.js"
import { useDialog, useDialogState } from "@opentui-ui/dialog/react"
import { GitActionDialogContent } from "./ui/git-dialog.js"
import { resolveTuiSession } from "./lifecycle.js"
import { resolveShellRuntime, type TuiSession } from "./shell.js"
import { PtySession } from "./pty.js"
import {
  loadRepos,
  loadLastWorkspace,
  saveLastWorkspace,
  moveSelection,
  pollWorkspaceActivity,
  wsKey,
  addRepoViaPicker,
  createWorkspace,
  archiveWorkspace,
  removeRepo,
  type SidebarRepo,
  type SidebarSelection,
  type SidebarDialog,
  type WorkspaceActivity,
} from "./sidebar-state.js"
import { keyToBytes, type KeyEvent } from "./lib/keys.js"

// ---------------------------------------------------------------------------
// Focus type
// ---------------------------------------------------------------------------

type Focus = "sidebar" | "canvas" | "extensions"
type ExtPanel = "vc" | "stack"

function nextFocus(f: Focus): Focus {
  if (f === "sidebar") return "canvas"
  if (f === "canvas") return "extensions"
  return "sidebar"
}

function prevFocus(f: Focus): Focus {
  if (f === "sidebar") return "extensions"
  if (f === "canvas") return "sidebar"
  return "canvas"
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

const SPINNER_INTERVAL = 80
const ACTIVITY_POLL_INTERVAL = 500

// ---------------------------------------------------------------------------
// App component
// ---------------------------------------------------------------------------

export function App() {
  const renderer = useRenderer()
  const dialogs = useDialog()
  const dialogOpen = useDialogState((s) => s.isOpen)

  // Session
  const [session, setSession] = useState<TuiSession>(() => resolveTuiSession())

  // Focus
  const [focus, setFocus] = useState<Focus>("canvas")

  // PTY
  const ptyRef = useRef<PtySession | null>(null)
  const [ptyChunks, setPtyChunks] = useState<string[]>([])
  const [hasPty, setHasPty] = useState(false)
  const clearPtyChunks = useCallback(() => setPtyChunks([]), [])

  // Sidebar
  const [repos, setRepos] = useState<SidebarRepo[]>(() => loadRepos())
  const [selected, setSelected] = useState<SidebarSelection | null>(() => {
    const last = loadLastWorkspace()
    if (!last) return repos.length ? { type: "repo", index: 0 } : null
    for (let ri = 0; ri < repos.length; ri++) {
      if (repos[ri].name === last.lastRepo) {
        repos[ri].expanded = true
        for (let wi = 0; wi < repos[ri].workspaces.length; wi++) {
          if (repos[ri].workspaces[wi].name === last.lastWorkspace) {
            return { type: "workspace", repoIndex: ri, wsIndex: wi }
          }
        }
      }
    }
    return repos.length ? { type: "repo", index: 0 } : null
  })
  const [dialog, setDialog] = useState<SidebarDialog | null>(null)

  // Activity
  const [activity, setActivity] = useState<Map<string, WorkspaceActivity>>(
    () => new Map(),
  )
  const [spinnerFrame, setSpinnerFrame] = useState(0)
  const activeWsKeyRef = useRef<string | null>(null)

  // Extensions
  const [extPanel, setExtPanel] = useState<ExtPanel>("vc")
  const [vcCollapsed, setVcCollapsed] = useState(false)
  const [stackCollapsed, setStackCollapsed] = useState(false)
  const [splitRatio, setSplitRatio] = useState(0.5)

  // Drag state
  const dragTarget = useRef<"left" | "right" | "hsplit" | "canvas" | null>(null)

  // Status message
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Dimensions
  const { width: termWidth, height: termHeight } = useTerminalDimensions()
  const [sidebarWidth, setSidebarWidth] = useState(34)
  const [extensionsWidth, setExtensionsWidth] = useState(38)
  const minColWidth = 20
  // 2 drag handles (1col each)
  const canvasCols = Math.max(minColWidth, termWidth - sidebarWidth - extensionsWidth - 2)
  const headerRows = 2 // header text + separator
  const columnHeight = Math.max(10, termHeight - 2 - headerRows)
  const canvasRows = columnHeight

  // Extensions panel heights: divider eats 1 row
  const extInnerRows = Math.max(4, columnHeight - 1)
  const collapsedHeight = 1
  const vcHeight = vcCollapsed
    ? collapsedHeight
    : stackCollapsed
      ? extInnerRows - collapsedHeight
      : Math.round(extInnerRows * splitRatio)
  const stackHeight = stackCollapsed
    ? collapsedHeight
    : extInnerRows - vcHeight

  // Header separator with box-drawing intersections
  const rightEdge = termWidth - extensionsWidth - 1
  let headerBorder = ""
  for (let i = 0; i < termWidth; i++) {
    if (i === sidebarWidth) headerBorder += "┼"
    else if (i === rightEdge) headerBorder += "┬"
    else headerBorder += "─"
  }

  // ---------------------------------------------------------------------------
  // PTY lifecycle
  // ---------------------------------------------------------------------------

  const spawnPty = useCallback(
    (shell: TuiSession["shell"]) => {
      // Kill existing PTY
      if (ptyRef.current) {
        ptyRef.current.destroy()
        ptyRef.current = null
      }

      if (shell.prepare) {
        const err = PtySession.runPrepare(shell.prepare)
        if (err) {
          setStatusMessage(`Prepare failed: ${err}`)
          return
        }
      }

      if (!shell.spec) return

      try {
        const pty = new PtySession(shell.spec, canvasRows, canvasCols)
        ptyRef.current = pty

        pty.onData((data) => {
          setPtyChunks((prev) => [...prev, data])
        })
        setHasPty(true)

        pty.onExit(() => {
          setStatusMessage("Shell exited")
        })
      } catch (err: any) {
        setStatusMessage(`PTY spawn failed: ${err?.message ?? err}`)
      }
    },
    [canvasRows, canvasCols],
  )

  // Initial PTY spawn
  useEffect(() => {
    spawnPty(session.shell)
    return () => {
      ptyRef.current?.destroy()
    }
  }, []) // Only on mount

  // Resize PTY when dimensions change
  useEffect(() => {
    ptyRef.current?.resize(canvasRows, canvasCols)
  }, [canvasRows, canvasCols])

  // ---------------------------------------------------------------------------
  // Activity polling
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const interval = setInterval(() => {
      const poll = pollWorkspaceActivity()
      if (poll.size === 0) return

      setActivity((prev) => {
        const next = new Map(prev)
        for (const [key, sample] of poll) {
          const isActive = activeWsKeyRef.current === key
          const current = prev.get(key) ?? "idle"

          let state: WorkspaceActivity
          if (sample.busy) {
            state = "busy"
          } else if (current === "busy" && isActive) {
            state = "idle"
          } else if (current === "busy") {
            state = "attention"
          } else {
            state = current
          }

          next.set(key, state)
        }
        return next
      })
    }, ACTIVITY_POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [])

  // Spinner animation
  useEffect(() => {
    const hasBusy = Array.from(activity.values()).some((a) => a === "busy")
    if (!hasBusy) return

    const interval = setInterval(() => {
      setSpinnerFrame((f) => f + 1)
    }, SPINNER_INTERVAL)

    return () => clearInterval(interval)
  }, [activity])

  // ---------------------------------------------------------------------------
  // Workspace activation
  // ---------------------------------------------------------------------------

  const activateWorkspace = useCallback(
    (repoIndex: number, wsIndex: number) => {
      const repo = repos[repoIndex]
      if (!repo) return
      const ws = repo.workspaces[wsIndex]
      if (!ws) return

      const targetKey = wsKey(repo.name, ws.name)
      if (activeWsKeyRef.current === targetKey) return

      saveLastWorkspace(repo.name, ws.name)

      const newScope = {
        ...session.workspace,
        binding: "adhoc" as const,
        workspaceId: ws.id,
        workspaceName: ws.name,
        repoName: repo.name,
        host: ws.host as any,
        status: ws.status,
        sourceRef: ws.sourceRef || null,
        cwd: ws.worktreePath ?? repo.path,
        worktreePath: ws.worktreePath ?? repo.path,
      }

      const newShell = resolveShellRuntime(newScope)
      const newSession = { workspace: newScope, shell: newShell }

      activeWsKeyRef.current = targetKey
      setActivity((prev) => {
        const next = new Map(prev)
        next.set(targetKey, "idle")
        return next
      })

      setSession(newSession)
      setPtyChunks([])
      setHasPty(false)
      spawnPty(newShell)
    },
    [repos, session, spawnPty],
  )

  // ---------------------------------------------------------------------------
  // Status message with auto-clear
  // ---------------------------------------------------------------------------

  function showStatus(msg: string, durationSec = 5) {
    setStatusMessage(msg)
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current)
    statusTimeoutRef.current = setTimeout(
      () => setStatusMessage(null),
      durationSec * 1000,
    )
  }

  // ---------------------------------------------------------------------------
  // Keyboard handler
  // ---------------------------------------------------------------------------

  useKeyboard((key: KeyEvent) => {
    // Ctrl+Q always quits
    if (key.ctrl && key.name === "q") {
      ptyRef.current?.destroy()
      renderer.destroy()
    }

    // Dialog open — it handles its own keys
    if (dialogOpen) return

    // Canvas mode: forward everything to PTY
    if (focus === "canvas") {
      const bytes = keyToBytes(key)
      if (bytes && ptyRef.current) {
        ptyRef.current.write(bytes)
      }
      // Tab escapes canvas (but still gets forwarded)
      if (key.name === "tab" && !key.ctrl) {
        setFocus(key.shift ? prevFocus("canvas") : nextFocus("canvas"))
      }
      return
    }

    // Tab cycles focus
    if (key.name === "tab") {
      setFocus((f) => (key.shift ? prevFocus(f) : nextFocus(f)))
      return
    }

    // +/- resize the focused column width
    const resizeStep = 2
    if (key.sequence === "+" || key.sequence === "=") {
      if (focus === "sidebar") {
        setSidebarWidth((w) => Math.min(termWidth - extensionsWidth - minColWidth - 4, w + resizeStep))
      } else if (focus === "extensions") {
        setExtensionsWidth((w) => Math.min(termWidth - sidebarWidth - minColWidth - 4, w + resizeStep))
      }
      return
    }
    if (key.sequence === "-" || key.sequence === "_") {
      if (focus === "sidebar") {
        setSidebarWidth((w) => Math.max(minColWidth, w - resizeStep))
      } else if (focus === "extensions") {
        setExtensionsWidth((w) => Math.max(minColWidth, w - resizeStep))
      }
      return
    }

    // Sidebar keys
    if (focus === "sidebar") {
      handleSidebarKey(key)
      return
    }

    // Extensions keys
    if (focus === "extensions") {
      switch (key.name) {
        case "q":
          ptyRef.current?.destroy()
          renderer.destroy()
          break
        case "j":
        case "down":
          setExtPanel((p) => (p === "vc" ? "stack" : "vc"))
          break
        case "k":
        case "up":
          setExtPanel((p) => (p === "vc" ? "stack" : "vc"))
          break
        case "return":
        case "enter":
        case "space":
          if (extPanel === "vc") setVcCollapsed((c) => !c)
          else setStackCollapsed((c) => !c)
          break
      }
      // {/} resize vertical split
      if (key.sequence === "{") {
        setSplitRatio((r) => Math.max(0.2, r - 0.1))
      } else if (key.sequence === "}") {
        setSplitRatio((r) => Math.min(0.8, r + 0.1))
      }
    }
  })

  function handleSidebarKey(key: KeyEvent) {
    // Dialog mode
    if (dialog) {
      if (dialog.type === "confirmDelete") {
        if (key.name === "y") {
          const repo = repos[dialog.repoIndex]
          if (repo?.path) {
            const ws = repo.workspaces[dialog.wsIndex]
            archiveWorkspace(ws.name, repo.path, true)
            setRepos(loadRepos())
          }
          setDialog(null)
        } else if (key.name === "n" || key.name === "escape") {
          setDialog(null)
        }
        return
      }

      if (dialog.type === "confirmDeleteRepo") {
        if (key.name === "y") {
          const repo = repos[dialog.repoIndex]
          if (repo?.path) {
            const result = removeRepo(repo.path)
            if (result.ok) {
              setRepos(loadRepos())
              setSelected(null)
            } else {
              showStatus(result.error ?? "Failed to remove repository")
            }
          }
          setDialog(null)
        } else if (key.name === "n" || key.name === "escape") {
          setDialog(null)
        }
        return
      }

      if (dialog.type === "newWorkspace") {
        if (key.name === "escape") {
          setDialog(null)
        } else if (key.name === "return" || key.name === "enter") {
          const name = dialog.input.trim()
          if (name) {
            const repo = repos[dialog.repoIndex]
            const result = createWorkspace(name, repo?.path ?? null)
            if (result.ok) {
              const updated = loadRepos()
              setRepos(updated)
              // Select the new workspace
              for (let ri = 0; ri < updated.length; ri++) {
                if (updated[ri].name === repo?.name) {
                  for (let wi = 0; wi < updated[ri].workspaces.length; wi++) {
                    if (updated[ri].workspaces[wi].name === name) {
                      setSelected({
                        type: "workspace",
                        repoIndex: ri,
                        wsIndex: wi,
                      })
                      activateWorkspace(ri, wi)
                      break
                    }
                  }
                }
              }
            } else {
              showStatus(result.error ?? "Failed to create workspace")
            }
          }
          setDialog(null)
        } else if (key.name === "backspace") {
          setDialog({
            ...dialog,
            input: dialog.input.slice(0, -1),
          })
        } else if (key.sequence?.length === 1) {
          setDialog({
            ...dialog,
            input: dialog.input + key.sequence,
          })
        }
        return
      }
    }

    // Normal sidebar navigation
    switch (key.name) {
      case "q":
        ptyRef.current?.destroy()
        renderer.destroy()
        break
      case "j":
      case "down":
        setSelected((s) => moveSelection(repos, s, "down"))
        break
      case "k":
      case "up":
        setSelected((s) => moveSelection(repos, s, "up"))
        break
      case "return":
      case "enter":
      case "space":
        if (selected?.type === "workspace") {
          activateWorkspace(selected.repoIndex, selected.wsIndex)
          setFocus("canvas")
        } else if (selected?.type === "repo") {
          setRepos((prev) => {
            const next = [...prev]
            next[selected.index] = {
              ...next[selected.index],
              expanded: !next[selected.index].expanded,
            }
            return next
          })
        }
        break
      case "a":
        if (addRepoViaPicker()) {
          setRepos(loadRepos())
        }
        break
      case "n":
        if (selected?.type === "repo") {
          setDialog({
            type: "newWorkspace",
            repoIndex: selected.index,
            input: "",
          })
        }
        break
      case "d":
        if (selected?.type === "repo") {
          const repo = repos[selected.index]
          setDialog({
            type: "confirmDeleteRepo",
            repoIndex: selected.index,
            message: `Remove "${repo.name}"? [y/n]`,
          })
        }
        break
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const notice =
    session.shell.launchError ?? session.workspace.resolutionNote

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" height={1}>
        <box width={sidebarWidth} flexShrink={0}>
          <SidebarHeader org="Personal" />
        </box>
        <box width={1} flexShrink={0}>
          <text content="│" fg="gray" />
        </box>
        <box flexGrow={1}>
          <RouteHeader
            repoName={session.workspace.repoName}
            workspaceName={session.workspace.workspaceName}
            cwd={session.workspace.cwd}
            onGitAction={() => {
              const cwd = session.workspace.cwd
              if (!cwd) return
              // Defer so the opening click doesn't also register as "click outside"
              setTimeout(() => {
                const id = "git-action"
                dialogs.show({
                  id,
                  content: () => (
                    <GitActionDialogContent
                      cwd={cwd}
                      dialogId={id}
                      onClose={() => dialogs.close(id)}
                    />
                  ),
                  size: "medium",
                  closeOnEscape: true,
                  closeOnClickOutside: true,
                })
              }, 0)
            }}
          />
        </box>
      </box>
      <box height={1}>
        <text content={headerBorder} fg="gray" />
      </box>
      <box
        flexDirection="row"
        flexGrow={1}
        height={columnHeight}
        onMouseDown={(e: any) => {
          const leftEdge = sidebarWidth
          const rightEdge = termWidth - extensionsWidth - 1
          const canvasLeft = sidebarWidth + 1
          const canvasRight = canvasLeft + canvasCols
          const inCanvas = e.x >= canvasLeft && e.x < canvasRight && e.y < canvasRows
          const inExtensions = e.x > rightEdge

          // Forward mouse press to the PTY (SGR encoding)
          if (inCanvas && ptyRef.current) {
            const col = e.x - canvasLeft + 1
            const row = e.y + 1
            const btn = e.button ?? 0
            ptyRef.current.write(`\x1b[<${btn};${col};${row}M`)
            dragTarget.current = "canvas"
            setFocus("canvas")
            e.preventDefault()
            return
          }

          if (Math.abs(e.x - leftEdge) <= 1) {
            dragTarget.current = "left"
            e.preventDefault()
          } else if (Math.abs(e.x - rightEdge) <= 1) {
            dragTarget.current = "right"
            e.preventDefault()
          } else if (inExtensions && Math.abs(e.y - vcHeight) <= 2) {
            dragTarget.current = "hsplit"
            e.preventDefault()
          } else {
            dragTarget.current = null
          }
        }}
        onMouseUp={(e: any) => {
          if (dragTarget.current === "canvas" && ptyRef.current) {
            const canvasLeft = sidebarWidth + 1
            const col = Math.max(1, Math.min(e.x - canvasLeft + 1, canvasCols))
            const row = Math.max(1, Math.min(e.y + 1, canvasRows))
            const btn = e.button ?? 0
            ptyRef.current.write(`\x1b[<${btn};${col};${row}m`)
            dragTarget.current = null
          }
        }}
        onMouseScroll={(e: any) => {
          const canvasLeft = sidebarWidth + 1
          const canvasRight = canvasLeft + canvasCols
          const inCanvas = e.x >= canvasLeft && e.x < canvasRight && e.y < canvasRows

          if (inCanvas && ptyRef.current && e.scroll) {
            const col = e.x - canvasLeft + 1
            const row = e.y + 1
            const btn = e.scroll.direction === "up" ? 64 : 65
            ptyRef.current.write(`\x1b[<${btn};${col};${row}M`)
          }
        }}
        onMouseDrag={(e: any) => {
          if (dragTarget.current) {
            e.preventDefault()
          }
          if (dragTarget.current === "canvas" && ptyRef.current) {
            const canvasLeft = sidebarWidth + 1
            const col = Math.max(1, Math.min(e.x - canvasLeft + 1, canvasCols))
            const row = Math.max(1, Math.min(e.y + 1, canvasRows))
            // SGR motion: button + 32
            ptyRef.current.write(`\x1b[<32;${col};${row}M`)
          } else if (dragTarget.current === "left") {
            setSidebarWidth(Math.max(minColWidth, Math.min(e.x, termWidth - extensionsWidth - minColWidth - 2)))
          } else if (dragTarget.current === "right") {
            setExtensionsWidth(Math.max(minColWidth, Math.min(termWidth - e.x, termWidth - sidebarWidth - minColWidth - 2)))
          } else if (dragTarget.current === "hsplit") {
            const ratio = Math.max(0.15, Math.min(0.85, e.y / columnHeight))
            setSplitRatio(ratio)
          }
        }}
        onMouseDragEnd={(e: any) => {
          if (dragTarget.current === "canvas" && ptyRef.current) {
            const canvasLeft = sidebarWidth + 1
            const col = Math.max(1, Math.min(e.x - canvasLeft + 1, canvasCols))
            const row = Math.max(1, Math.min(e.y + 1, canvasRows))
            const btn = e.button ?? 0
            ptyRef.current.write(`\x1b[<${btn};${col};${row}m`)
          }
          dragTarget.current = null
        }}
      >
        <box width={sidebarWidth} flexShrink={0}>
          <Sidebar
            repos={repos}
            selected={selected}
            focused={focus === "sidebar"}
            dialog={dialog}
            spinnerFrame={spinnerFrame}
            activity={activity}
            width={sidebarWidth}
            onRepoClick={(ri) => {
              setSelected({ type: "repo", index: ri })
              setFocus("sidebar")
              setRepos((prev) => {
                const next = [...prev]
                next[ri] = { ...next[ri], expanded: !next[ri].expanded }
                return next
              })
            }}
            onRepoPlusClick={(ri) => {
              setSelected({ type: "repo", index: ri })
              setFocus("sidebar")
              setDialog({ type: "newWorkspace", repoIndex: ri, input: "" })
            }}
            onWsClick={(ri, wi) => {
              setSelected({ type: "workspace", repoIndex: ri, wsIndex: wi })
              activateWorkspace(ri, wi)
              setFocus("canvas")
            }}
            onWsArchiveClick={(ri, wi) => {
              const repo = repos[ri]
              if (!repo?.path) return
              const ws = repo.workspaces[wi]
              if (!ws) return
              const result = archiveWorkspace(ws.name, repo.path, false)
              if (result.ok) {
                setRepos(loadRepos())
              } else if (result.needsConfirm) {
                setDialog({
                  type: "confirmDelete",
                  repoIndex: ri,
                  wsIndex: wi,
                  message: `"${ws.name}" has uncommitted changes. Delete? [y/n]`,
                })
              }
            }}
            onAddRepoClick={() => {
              if (addRepoViaPicker()) {
                setRepos(loadRepos())
              }
            }}
          />
        </box>
        <box width={1} flexShrink={0}>
          <text content={Array(columnHeight).fill("│").join("\n")} fg="gray" />
        </box>
        <Canvas
          chunks={ptyChunks}
          onChunksConsumed={clearPtyChunks}
          cols={canvasCols}
          rows={canvasRows}
          focused={focus === "canvas" && !dialogOpen}
          notice={hasPty ? null : notice}
        />
        <box width={1} flexShrink={0}>
          <text content={Array(columnHeight).fill("│").join("\n")} fg="gray" />
        </box>
        <box
          width={extensionsWidth}
          flexShrink={0}
          flexDirection="column"
          height={columnHeight}
        >
          <VcPanel
            cwd={session.workspace.cwd}
            focused={focus === "extensions" && extPanel === "vc"}
            collapsed={vcCollapsed}
            height={vcHeight}
          />
          <box height={1}>
            <text
              content={"─".repeat(extensionsWidth)}
              fg={focus === "extensions" ? "cyan" : "gray"}
            />
          </box>
          <StackPanel
            cwd={session.workspace.cwd}
            focused={focus === "extensions" && extPanel === "stack"}
            collapsed={stackCollapsed}
            height={stackHeight}
          />
        </box>
      </box>
      <StatusBar
        workspaceName={session.workspace.workspaceName}
        hostLabel={session.workspace.host}
        focus={focus}
        message={statusMessage}
        sidebarWidth={sidebarWidth}
        extensionsWidth={extensionsWidth}
        termWidth={termWidth}
      />
    </box>
  )
}
