import { ptyToJson } from "ghostty-opentui"
import {
  GhosttyTerminalRenderable,
  terminalDataToStyledText,
} from "ghostty-opentui/terminal-buffer"
import { repairTmuxPaneBorders } from "./lib/tmux-border-repair.js"

export class TmuxTerminalRenderable extends GhosttyTerminalRenderable {
  protected renderSelf(buffer: any): void {
    const self = this as any

    if (self._ansiDirty) {
      let data = self._persistentTerminal
        ? self._persistentTerminal.getJson({
            limit: self._limit,
          })
        : ptyToJson(self._ansi, {
            cols: self._cols,
            rows: self._rows,
            limit: self._limit,
          })

      if (self._trimEnd) {
        while (data.lines.length > 0) {
          const lastLine = data.lines[data.lines.length - 1]
          const hasText = lastLine.spans.some(
            (span: any) => span.text.trim().length > 0,
          )
          if (hasText) break
          data.lines.pop()
        }
      }

      data = repairTmuxPaneBorders(data)

      self.textBuffer.setStyledText(
        terminalDataToStyledText(data, self._highlights),
      )
      self.updateTextInfo()

      if (self._showCursor) {
        const cursorY = Math.max(
          0,
          data.totalLines - data.rows + data.cursor[1] - data.offset,
        )
        self._renderCursor.x = data.cursor[0]
        self._renderCursor.y = cursorY
        self._renderCursor.visible =
          data.cursorVisible && cursorY < data.lines.length
        const ts = data.cursorStyle
        self._renderCursor.style =
          ts === "default"
            ? "default"
            : ts === "bar"
              ? "line"
              : ts === "underline"
                ? "underline"
                : "block"
      } else {
        self._renderCursor.visible = false
      }

      self._lineCount = data.lines.length
      self._ansiDirty = false
    }

    Object.getPrototypeOf(GhosttyTerminalRenderable.prototype).renderSelf.call(
      this,
      buffer,
    )
    self.renderTerminalCursor()
  }
}
