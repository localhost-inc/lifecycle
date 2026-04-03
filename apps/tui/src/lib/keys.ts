/**
 * Convert an opentui KeyEvent into the byte sequence a PTY expects.
 * Prefers `sequence` from the framework (which is the raw terminal input).
 */
import type { KeyEvent } from "@opentui/core"

export type { KeyEvent }

export function keyToBytes(key: KeyEvent): string {
  const { name, ctrl, option: alt } = key
  if (!name) return ""

  // When Kitty keyboard protocol is active, key.sequence may contain CSI-u
  // encoded escapes (e.g. \x1b[97;5u for Ctrl+a). The PTY/tmux expects
  // legacy terminal bytes, so compute those explicitly for modified keys
  // rather than forwarding the raw sequence.

  let base: string

  if (ctrl && name.length === 1 && /[a-z]/i.test(name)) {
    const code = name.toLowerCase().charCodeAt(0) - 0x60
    base = String.fromCharCode(code)
  } else if (name.length === 1) {
    // Unmodified single character — prefer sequence if available (handles
    // shifted keys, compose input, etc.) otherwise fall back to name.
    if (key.sequence && !ctrl && !alt) return key.sequence
    base = name
  } else {
    switch (name) {
      case "return":
      case "enter":
        base = "\r"
        break
      case "backspace":
        base = "\x7f"
        break
      case "escape":
        base = "\x1b"
        break
      case "tab":
        base = "\t"
        break
      case "up":
        base = "\x1b[A"
        break
      case "down":
        base = "\x1b[B"
        break
      case "right":
        base = "\x1b[C"
        break
      case "left":
        base = "\x1b[D"
        break
      case "home":
        base = "\x1b[H"
        break
      case "end":
        base = "\x1b[F"
        break
      case "insert":
        base = "\x1b[2~"
        break
      case "delete":
        base = "\x1b[3~"
        break
      case "pageup":
        base = "\x1b[5~"
        break
      case "pagedown":
        base = "\x1b[6~"
        break
      case "f1":
        base = "\x1bOP"
        break
      case "f2":
        base = "\x1bOQ"
        break
      case "f3":
        base = "\x1bOR"
        break
      case "f4":
        base = "\x1bOS"
        break
      case "f5":
        base = "\x1b[15~"
        break
      case "f6":
        base = "\x1b[17~"
        break
      case "f7":
        base = "\x1b[18~"
        break
      case "f8":
        base = "\x1b[19~"
        break
      case "f9":
        base = "\x1b[20~"
        break
      case "f10":
        base = "\x1b[21~"
        break
      case "f11":
        base = "\x1b[23~"
        break
      case "f12":
        base = "\x1b[24~"
        break
      default:
        return ""
    }
  }

  if (alt && base) {
    return `\x1b${base}`
  }

  return base
}
