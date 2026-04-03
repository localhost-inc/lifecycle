import { describe, expect, test } from "bun:test"
import { repairTmuxPaneBorders } from "./tmux-border-repair.js"

describe("repairTmuxPaneBorders", () => {
  test("extends pane separators through rows where the parser drops blank tmux borders", () => {
    const data = {
      cols: 20,
      rows: 8,
      lines: [
        { spans: [{ text: "top left   top right", fg: null, bg: null, flags: 0, width: 20 }] },
        { spans: [{ text: "──────────┬─────────", fg: null, bg: null, flags: 0, width: 20 }] },
        { spans: [{ text: "left      │", fg: null, bg: null, flags: 0, width: 11 }] },
        { spans: [] },
        { spans: [{ text: "           right", fg: null, bg: null, flags: 0, width: 16 }] },
        { spans: [] },
        { spans: [{ text: "status line", fg: null, bg: null, flags: 0, width: 11 }] },
      ],
    }

    const repaired = repairTmuxPaneBorders(data)
    const text = repaired.lines.map((line) => line.spans.map((span) => span.text).join(""))

    expect(text[2]).toBe("left      │")
    expect(text[3]).toBe("          │")
    expect(text[4]).toBe("          │right")
    expect(text[5]).toBe("          │")
  })
})
