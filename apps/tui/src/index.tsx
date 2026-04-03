import { createCliRenderer } from "@opentui/core"
import { createRoot, extend } from "@opentui/react"
import { DialogProvider } from "@opentui-ui/dialog/react"
import { App } from "./app.js"
import { TmuxTerminalRenderable } from "./tmux-terminal.js"

// Register the ghostty terminal component for use in JSX
extend({ "ghostty-terminal": TmuxTerminalRenderable })

// Kill any previous TUI instance to avoid stale processes during dev cycles
const pidFile = `${process.env.HOME}/.lifecycle/tui.pid`
try {
  const fs = await import("node:fs")
  const oldPid = fs.readFileSync(pidFile, "utf-8").trim()
  const pid = parseInt(oldPid, 10)
  if (pid && pid !== process.pid) {
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      // Process already dead
    }
    await Bun.sleep(100)
  }
} catch {
  // No pid file
}

// Write our PID
try {
  const fs = await import("node:fs")
  const path = await import("node:path")
  fs.mkdirSync(path.dirname(pidFile), { recursive: true })
  fs.writeFileSync(pidFile, String(process.pid))
} catch {
  // Ignore
}

// Create the opentui renderer
const renderer = await createCliRenderer({
  exitOnCtrlC: false, // We handle Ctrl+Q ourselves
})

// Mount the React app
createRoot(renderer).render(
  <DialogProvider>
    <App />
  </DialogProvider>,
)
