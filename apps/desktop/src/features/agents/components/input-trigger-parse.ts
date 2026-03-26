export interface TriggerState {
  trigger: "@" | "/" | null;
  query: string;
  startIndex: number;
  endIndex: number;
}

const NO_TRIGGER: TriggerState = { trigger: null, query: "", startIndex: -1, endIndex: -1 };

/**
 * Scan backward from `cursorPos` to find an active trigger character.
 *
 * - `@` triggers when preceded by whitespace or at position 0.
 * - `/` triggers only at the start of a line (position 0 or after `\n`).
 *
 * Returns the trigger type, the query text typed after it, and the start/end
 * indices so the caller can splice it out of the draft.
 */
export function parseTrigger(text: string, cursorPos: number): TriggerState {
  if (cursorPos <= 0 || cursorPos > text.length) return NO_TRIGGER;

  // Scan backward from cursor — stop at newline or start of string.
  for (let i = cursorPos - 1; i >= 0; i--) {
    const ch = text[i];

    // Whitespace before we find a trigger → no active trigger.
    if (ch === " " || ch === "\t") return NO_TRIGGER;
    if (ch === "\n") return NO_TRIGGER;

    if (ch === "@") {
      // Must be at position 0 or preceded by whitespace.
      if (i > 0 && text[i - 1] !== " " && text[i - 1] !== "\t" && text[i - 1] !== "\n") {
        return NO_TRIGGER;
      }
      return {
        trigger: "@",
        query: text.slice(i + 1, cursorPos),
        startIndex: i,
        endIndex: cursorPos,
      };
    }

    if (ch === "/") {
      // Must be at the start of a line.
      if (i > 0 && text[i - 1] !== "\n") return NO_TRIGGER;
      return {
        trigger: "/",
        query: text.slice(i + 1, cursorPos),
        startIndex: i,
        endIndex: cursorPos,
      };
    }
  }

  return NO_TRIGGER;
}
