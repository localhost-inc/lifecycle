import React, { useState, useEffect, useRef } from "react"
import { tryLifecycleJson } from "../lib/cli.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceEntry {
  name: string
  status: string
  port: number | null
  previewUrl: string | null
}

interface LogLine {
  service: string
  text: string
  timestamp: string
  isError: boolean
}

type StackTab = "services" | "logs"

interface StackStatusPayload {
  services: Array<{
    name: string
    status: string
    assigned_port: number | null
    preview_url: string | null
  }>
}

interface StackPanelProps {
  cwd: string | null
  focused: boolean
  collapsed: boolean
  height: number
}

const SERVICE_POLL_INTERVAL = 5_000
const MAX_LOG_LINES = 500

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StackPanel({ cwd, focused, collapsed, height }: StackPanelProps) {
  const [activeTab, setActiveTab] = useState<StackTab>("services")
  const [services, setServices] = useState<ServiceEntry[]>([])
  const [logs, setLogs] = useState<LogLine[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll services
  useEffect(() => {
    if (!cwd) {
      setServices([])
      setLogs([])
      return
    }

    function poll() {
      const payload = tryLifecycleJson<StackStatusPayload>([
        "stack",
        "status",
        "--cwd",
        cwd!,
      ])
      if (payload) {
        setServices(
          payload.services.map((s) => ({
            name: s.name,
            status: s.status,
            port: s.assigned_port,
            previewUrl: s.preview_url,
          })),
        )
      }
    }

    poll()
    pollRef.current = setInterval(poll, SERVICE_POLL_INTERVAL)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [cwd])

  const icon = collapsed ? "▶" : "▼"
  const titleColor = focused ? "cyan" : "white"

  if (collapsed) {
    return (
      <box height={1}>
        <text content={` ${icon} `} fg="gray" />
        <text fg={titleColor}><b>Stack</b></text>
      </box>
    )
  }

  const tabLabel =
    activeTab === "services" ? "[Services] Logs" : "Services [Logs]"

  return (
    <box flexDirection="column" height={height}>
      <box flexDirection="row">
        <text content={` ${icon} `} fg="gray" />
        <text fg={titleColor}><b>Stack</b></text>
      </box>
      <text content={`   ${tabLabel}`} fg="gray" />
      <scrollbox flexGrow={1}>
        {activeTab === "services" ? (
          <ServicesContent services={services} />
        ) : (
          <LogsContent logs={logs} />
        )}
      </scrollbox>
    </box>
  )
}

function ServicesContent({ services }: { services: ServiceEntry[] }) {
  if (services.length === 0) {
    return <text content="No services" fg="gray" />
  }

  return (
    <box flexDirection="column">
      {services.map((s, i) => {
        const statusColor =
          s.status === "ready"
            ? "green"
            : s.status === "starting"
              ? "yellow"
              : s.status === "failed"
                ? "red"
                : "gray"
        const indicator =
          s.status === "ready"
            ? "●"
            : s.status === "starting"
              ? "◐"
              : s.status === "failed"
                ? "✗"
                : "○"

        return (
          <box key={i} flexDirection="row">
            <text content={`${indicator} `} fg={statusColor} />
            <text content={s.name.padEnd(12)} fg="white" />
            <text content={s.status} fg={statusColor} />
            {s.port && <text content={`  :${s.port}`} fg="gray" />}
          </box>
        )
      })}
    </box>
  )
}

function LogsContent({ logs }: { logs: LogLine[] }) {
  if (logs.length === 0) {
    return <text content="No logs" fg="gray" />
  }

  const recent = logs.slice(-100)

  return (
    <box flexDirection="column">
      {recent.map((l, i) => {
        const ts =
          l.timestamp.length >= 23 ? l.timestamp.slice(11, 23) : l.timestamp
        return (
          <box key={i} flexDirection="row">
            <text content={`${ts} `} fg="gray" />
            <text content={l.service.padEnd(8)} fg="gray" />
            <text content={l.text} fg={l.isError ? "red" : "gray"} />
          </box>
        )
      })}
    </box>
  )
}
