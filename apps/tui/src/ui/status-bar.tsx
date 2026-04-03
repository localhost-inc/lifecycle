import React from "react"

type Focus = "sidebar" | "canvas" | "extensions"

// Pixel infinity sign rendered as braille dots
const PIXEL_INFINITY = "\u{288E}\u{2871}\u{288E}\u{2871}"

interface StatusBarProps {
  workspaceName: string
  hostLabel: string
  focus: Focus
  message: string | null
  sidebarWidth: number
  extensionsWidth: number
  termWidth: number
}

export function StatusBar({
  workspaceName,
  hostLabel,
  focus,
  message,
  sidebarWidth,
  extensionsWidth,
  termWidth,
}: StatusBarProps) {
  const hints =
    focus === "sidebar"
      ? "tab focus · n new · a add · d remove · q quit"
      : focus === "canvas"
        ? "tab focus"
        : "tab focus · 1/2 toggle · q quit"

  const left =
    message ?? `${PIXEL_INFINITY} ${workspaceName} · ${hostLabel}`

  // Build border with intersections at column divider positions
  const rightEdge = termWidth - extensionsWidth - 1
  let border = ""
  for (let i = 0; i < termWidth; i++) {
    if (i === sidebarWidth || i === rightEdge) {
      border += "┴"
    } else {
      border += "─"
    }
  }

  return (
    <box height={2} flexDirection="column">
      <text content={border} fg="gray" />
      <box flexDirection="row">
        <text
          content={` ${left}`}
          fg={message ? "yellow" : "gray"}
        />
        <box flexGrow={1} />
        <text content={`${hints} `} fg="gray" />
      </box>
    </box>
  )
}
