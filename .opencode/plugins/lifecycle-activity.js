export const LifecycleActivityPlugin = async ({ client }) => ({
  event: async ({ event }) => {
    const resolveTerminalId = async () => {
      if (process.env.LIFECYCLE_TERMINAL_ID) {
        return process.env.LIFECYCLE_TERMINAL_ID
      }
      if (!process.env.TMUX_PANE) {
        return null
      }
      try {
        const { execFile } = await import("node:child_process")
        return await new Promise((resolve) => {
          execFile(
            "tmux",
            ["display-message", "-p", "-t", process.env.TMUX_PANE, "#{window_id}"],
            { timeout: 1000 },
            (error, stdout) => {
              if (error) {
                resolve(null)
                return
              }
              const id = stdout.trim()
              resolve(id.length > 0 ? id : null)
            },
          )
        })
      } catch {
        return null
      }
    }

    const run = async (...args) => {
      if (!process.env.LIFECYCLE_WORKSPACE_ID) {
        return
      }
      const terminalId = await resolveTerminalId()
      if (!terminalId) {
        return
      }
      const { spawn } = await import("node:child_process")
      const command = process.env.LIFECYCLE_CLI_BIN || "lifecycle"
      const child = spawn(command, [
        "workspace",
        "activity",
        "emit",
        ...args,
        "--terminal-id",
        terminalId,
      ], {
        detached: true,
        stdio: "ignore",
      })
      child.unref()
    }

    if (event.type === "session.idle") {
      await run("turn.completed", "--provider", "opencode")
      return
    }

    if (event.type !== "session.prompt") {
      return
    }

    const args = ["turn.started", "--provider", "opencode"]
    const sessionID = event.properties?.sessionID
    if (typeof sessionID === "string" && sessionID.length > 0) {
      args.push("--turn-id", sessionID)
    }
    await run(...args)
  },
})
