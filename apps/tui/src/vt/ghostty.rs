use ratatui::style::Color;

use libghostty_vt::render::{CellIterator, Dirty, RenderState, RowIterator};
use libghostty_vt::{Terminal, TerminalOptions};

use super::{VtBackend, VtCell, VtGrid};

pub struct GhosttyBackend {
    term: Terminal<'static, 'static>,
    render_state: RenderState<'static>,
    row_iter: RowIterator<'static>,
    cell_iter: CellIterator<'static>,
    rows: u16,
    cols: u16,
    /// Persistent grid storage — reused across frames.
    cached: VtGrid,
}

impl VtBackend for GhosttyBackend {
    fn new(rows: u16, cols: u16) -> Self {
        let term = Terminal::new(TerminalOptions {
            cols,
            rows,
            max_scrollback: 10_000,
        })
        .expect("failed to create ghostty terminal");

        let render_state = RenderState::new().expect("failed to create render state");
        let row_iter = RowIterator::new().expect("failed to create row iterator");
        let cell_iter = CellIterator::new().expect("failed to create cell iterator");

        let cached = alloc_grid(rows, cols);

        Self {
            term,
            render_state,
            row_iter,
            cell_iter,
            rows,
            cols,
            cached,
        }
    }

    fn process(&mut self, bytes: &[u8]) {
        self.term.vt_write(bytes);
    }

    fn resize(&mut self, rows: u16, cols: u16) {
        self.rows = rows;
        self.cols = cols;
        let _ = self.term.resize(cols, rows, 1, 1);
        // Reallocate grid when dimensions change.
        ensure_grid_size(&mut self.cached, rows, cols);
    }

    fn is_dirty(&mut self) -> bool {
        let snap = match self.render_state.update(&self.term) {
            Ok(s) => s,
            Err(_) => return true, // assume dirty on error
        };
        match snap.dirty() {
            Ok(Dirty::Clean) => false,
            _ => true,
        }
    }

    fn snapshot(&mut self) -> VtGrid {
        let snap = match self.render_state.update(&self.term) {
            Ok(s) => s,
            Err(_) => return self.cached.clone(),
        };

        // Read cursor state.
        let cursor_visible = snap.cursor_visible().unwrap_or(false);
        let (cursor_col, cursor_row) = snap
            .cursor_viewport()
            .ok()
            .flatten()
            .map(|c| (c.x, c.y))
            .unwrap_or((0, 0));

        self.cached.cursor_row = cursor_row;
        self.cached.cursor_col = cursor_col;
        self.cached.cursor_visible = cursor_visible;

        // Ensure grid dimensions match.
        ensure_grid_size(&mut self.cached, self.rows, self.cols);

        let dirty_level = snap.dirty().unwrap_or(Dirty::Full);
        let full_redraw = matches!(dirty_level, Dirty::Full);

        // Reusable stack buffer for grapheme codepoints.
        let mut gbuf = ['\0'; 8];

        let mut row_iter = match self.row_iter.update(&snap) {
            Ok(r) => r,
            Err(_) => {
                let _ = snap.set_dirty(Dirty::Clean);
                return self.cached.clone();
            }
        };

        let mut row_idx = 0usize;
        while let Some(row) = row_iter.next() {
            let row_dirty = row.dirty().unwrap_or(true);

            // Skip clean rows unless a full redraw is needed.
            if !full_redraw && !row_dirty {
                row_idx += 1;
                continue;
            }

            if let Some(cells_row) = self.cached.cells.get_mut(row_idx) {
                let mut cell_iter = match self.cell_iter.update(&row) {
                    Ok(c) => c,
                    Err(_) => break,
                };

                let mut col_idx = 0usize;
                while let Some(cell) = cell_iter.next() {
                    if col_idx >= cells_row.len() {
                        break;
                    }

                    let len = cell.graphemes_len().unwrap_or(0);
                    let ch = if len == 0 {
                        ' '
                    } else {
                        let buf_len = len.min(gbuf.len());
                        if cell.graphemes_buf(&mut gbuf[..buf_len]).is_ok() {
                            gbuf[0]
                        } else {
                            ' '
                        }
                    };

                    let fg = cell
                        .fg_color()
                        .ok()
                        .flatten()
                        .map(|c| Color::Rgb(c.r, c.g, c.b));
                    let bg = cell
                        .bg_color()
                        .ok()
                        .flatten()
                        .map(|c| Color::Rgb(c.r, c.g, c.b));

                    let style = cell.style().ok();
                    let bold = style.as_ref().map_or(false, |s| s.bold);
                    let italic = style.as_ref().map_or(false, |s| s.italic);
                    let inverse = style.as_ref().map_or(false, |s| s.inverse);
                    let underline = style.as_ref().map_or(false, |s| {
                        !matches!(s.underline, libghostty_vt::style::Underline::None)
                    });

                    let target = &mut cells_row[col_idx];
                    target.ch = ch;
                    target.fg = fg;
                    target.bg = bg;
                    target.bold = bold;
                    target.italic = italic;
                    target.underline = underline;
                    target.inverse = inverse;

                    col_idx += 1;
                }
            }

            // Clear per-row dirty flag.
            let _ = row.set_dirty(false);
            row_idx += 1;
        }

        // Clear global dirty state.
        let _ = snap.set_dirty(Dirty::Clean);

        self.cached.clone()
    }
}

/// Allocate a grid with default (blank) cells.
fn alloc_grid(rows: u16, cols: u16) -> VtGrid {
    let cells = (0..rows)
        .map(|_| vec![VtCell::default(); cols as usize])
        .collect();
    VtGrid {
        rows,
        cols,
        cursor_row: 0,
        cursor_col: 0,
        cursor_visible: false,
        cells,
    }
}

/// Resize the cached grid in-place, preserving existing data where possible.
fn ensure_grid_size(grid: &mut VtGrid, rows: u16, cols: u16) {
    if grid.rows == rows && grid.cols == cols {
        return;
    }
    grid.rows = rows;
    grid.cols = cols;
    grid.cells
        .resize_with(rows as usize, || vec![VtCell::default(); cols as usize]);
    for row in &mut grid.cells {
        row.resize_with(cols as usize, VtCell::default);
    }
}
