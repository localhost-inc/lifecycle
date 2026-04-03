import React, { useRef, useEffect } from "react"

interface CanvasProps {
  /** Incremental PTY data chunks to feed to the terminal */
  chunks: string[]
  /** Signal to clear/consume chunks after processing */
  onChunksConsumed: () => void
  cols: number
  rows: number
  focused: boolean
  notice: string | null
}

export function Canvas({
  chunks,
  onChunksConsumed,
  cols,
  rows,
  focused,
  notice,
}: CanvasProps) {
  const termRef = useRef<any>(null)

  // Feed incremental data to the persistent terminal
  useEffect(() => {
    if (chunks.length === 0) return
    const term = termRef.current
    if (term?.feed) {
      for (const chunk of chunks) {
        term.feed(chunk)
      }
    }
    onChunksConsumed()
  }, [chunks, onChunksConsumed])

  // Show notice when no PTY is connected
  if (notice && chunks.length === 0 && !termRef.current) {
    return (
      <box width={cols} height={rows} flexShrink={0}>
        <text content={notice} fg="gray" />
      </box>
    )
  }

  return (
    <box width={cols} height={rows} flexShrink={0}>
      <ghostty-terminal
        ref={termRef}
        persistent
        showCursor={focused}
        style={{ width: cols, height: rows }}
        width={cols}
        height={rows}
        cols={cols}
        rows={rows}
      />
    </box>
  )
}
