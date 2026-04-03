import React from "react"

interface ButtonProps {
  label: string
  bg: string
  fg?: string
  onPress?: () => void
}

export function Button({ label, bg, fg = "black", onPress }: ButtonProps) {
  return (
    <box onMouseDown={onPress}>
      <text bg={bg} fg={fg}>
        {` ${label} `}
      </text>
    </box>
  )
}
