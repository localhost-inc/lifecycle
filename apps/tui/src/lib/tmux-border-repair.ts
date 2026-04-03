interface TerminalSpanLike {
  text: string
  fg: string | null
  bg: string | null
  flags: number
  width: number
}

interface TerminalLineLike {
  spans: TerminalSpanLike[]
}

interface TerminalDataLike {
  cols: number
  rows: number
  lines: TerminalLineLike[]
}

interface CellLike {
  char: string
  fg: string | null
  bg: string | null
  flags: number
}

const HORIZONTAL_BORDER_CHARS = new Set([
  "─",
  "┬",
  "┼",
  "┴",
  "├",
  "┤",
  "┌",
  "┐",
  "└",
  "┘",
])

const INTERSECTION_CHARS = new Set(["┬", "┼", "┴"])
const VERTICAL_CHAR = "│"

function lineToCells(line: TerminalLineLike): CellLike[] {
  const cells: CellLike[] = []

  for (const span of line.spans) {
    for (const char of Array.from(span.text)) {
      cells.push({
        char,
        fg: span.fg,
        bg: span.bg,
        flags: span.flags,
      })
    }
  }

  return cells
}

function isStyled(cell: CellLike | undefined): boolean {
  if (!cell) return false
  return cell.fg !== null || cell.bg !== null || cell.flags !== 0
}

function cellsToLine(cells: CellLike[]): TerminalLineLike {
  let lastMeaningful = -1
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    if (!cell) continue
    if (cell.char !== " " || isStyled(cell)) {
      lastMeaningful = i
    }
  }

  if (lastMeaningful === -1) {
    return { spans: [] }
  }

  const spans: TerminalSpanLike[] = []
  let currentText = ""
  let currentStyle: Omit<TerminalSpanLike, "text" | "width"> | null = null

  const flush = () => {
    if (!currentStyle || currentText.length === 0) return
    spans.push({
      ...currentStyle,
      text: currentText,
      width: Array.from(currentText).length,
    })
    currentText = ""
  }

  for (let i = 0; i <= lastMeaningful; i++) {
    const cell = cells[i] ?? {
      char: " ",
      fg: null,
      bg: null,
      flags: 0,
    }

    if (
      !currentStyle ||
      currentStyle.fg !== cell.fg ||
      currentStyle.bg !== cell.bg ||
      currentStyle.flags !== cell.flags
    ) {
      flush()
      currentStyle = {
        fg: cell.fg,
        bg: cell.bg,
        flags: cell.flags,
      }
    }

    currentText += cell.char
  }

  flush()
  return { spans }
}

function rowHasHorizontalBorder(cells: CellLike[]): boolean {
  return cells.some((cell) => HORIZONTAL_BORDER_CHARS.has(cell.char))
}

function findBoundaryCandidateColumns(
  cells: CellLike[] | undefined,
  columns: Set<number>,
) {
  if (!cells) return
  for (let col = 0; col < cells.length; col++) {
    const char = cells[col]?.char
    if (char && INTERSECTION_CHARS.has(char)) {
      columns.add(col)
    }
  }
}

function findVerticalCandidateColumns(
  rows: CellLike[][],
  startRow: number,
  endRow: number,
  columns: Set<number>,
) {
  const counts = new Map<number, number>()

  for (let row = startRow; row <= endRow; row++) {
    const cells = rows[row]
    for (let col = 0; col < cells.length; col++) {
      if (cells[col]?.char === VERTICAL_CHAR) {
        counts.set(col, (counts.get(col) ?? 0) + 1)
      }
    }
  }

  for (const [col, count] of counts) {
    if (count >= 2) {
      columns.add(col)
    }
  }
}

function sampleBorderStyle(
  rows: CellLike[][],
  startRow: number,
  endRow: number,
  col: number,
): CellLike {
  for (let row = startRow; row <= endRow; row++) {
    const cell = rows[row]?.[col]
    if (
      cell &&
      (cell.char === VERTICAL_CHAR || INTERSECTION_CHARS.has(cell.char))
    ) {
      return {
        char: VERTICAL_CHAR,
        fg: cell.fg,
        bg: cell.bg,
        flags: cell.flags,
      }
    }
  }

  return {
    char: VERTICAL_CHAR,
    fg: null,
    bg: null,
    flags: 0,
  }
}

export function repairTmuxPaneBorders<T extends TerminalDataLike>(data: T): T {
  const interactiveLastRow = Math.max(0, Math.min(data.lines.length, data.rows) - 2)
  if (interactiveLastRow <= 0) return data

  const rows = data.lines.map(lineToCells)
  const horizontalRows: number[] = []

  for (let row = 0; row <= interactiveLastRow; row++) {
    if (rowHasHorizontalBorder(rows[row] ?? [])) {
      horizontalRows.push(row)
    }
  }

  const boundaries = [-1, ...horizontalRows, interactiveLastRow + 1]
  let changed = false

  for (let i = 0; i < boundaries.length - 1; i++) {
    const boundaryTop = boundaries[i]
    const boundaryBottom = boundaries[i + 1]
    const startRow = boundaryTop + 1
    const endRow = boundaryBottom - 1
    if (startRow > endRow) continue

    const candidateColumns = new Set<number>()
    findBoundaryCandidateColumns(rows[boundaryTop], candidateColumns)
    findVerticalCandidateColumns(rows, startRow, endRow, candidateColumns)

    for (const col of candidateColumns) {
      const style = sampleBorderStyle(
        rows,
        Math.max(0, boundaryTop),
        Math.min(interactiveLastRow, boundaryBottom),
        col,
      )

      for (let row = startRow; row <= endRow; row++) {
        const cells = rows[row]
        const existing = cells[col]
        if (existing?.char && existing.char !== " ") {
          continue
        }

        while (cells.length <= col) {
          cells.push({
            char: " ",
            fg: null,
            bg: null,
            flags: 0,
          })
        }

        cells[col] = style
        changed = true
      }
    }
  }

  if (!changed) return data

  return {
    ...data,
    lines: rows.map(cellsToLine),
  }
}
