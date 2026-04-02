use ratatui::style::Color;

use super::{VtBackend, VtCell, VtGrid};

/// VT backend using the `vt100` crate as a fallback.
pub struct Vt100Backend {
    parser: vt100::Parser,
}

impl VtBackend for Vt100Backend {
    fn new(rows: u16, cols: u16) -> Self {
        Self {
            parser: vt100::Parser::new(rows, cols, 0),
        }
    }

    fn process(&mut self, bytes: &[u8]) {
        self.parser.process(bytes);
    }

    fn resize(&mut self, rows: u16, cols: u16) {
        self.parser.set_size(rows, cols);
    }

    fn is_dirty(&mut self) -> bool {
        true // vt100 has no dirty tracking
    }

    fn snapshot(&mut self) -> VtGrid {
        let screen = self.parser.screen();
        let rows = screen.size().0;
        let cols = screen.size().1;
        let cursor = screen.cursor_position();

        let cells = (0..rows)
            .map(|row| {
                (0..cols)
                    .map(|col| {
                        let cell = screen.cell(row, col).unwrap();
                        let fg = convert_vt100_color(cell.fgcolor());
                        let bg = convert_vt100_color(cell.bgcolor());
                        VtCell {
                            ch: cell.contents().chars().next().unwrap_or(' '),
                            fg,
                            bg,
                            bold: cell.bold(),
                            italic: cell.italic(),
                            underline: cell.underline(),
                            inverse: cell.inverse(),
                        }
                    })
                    .collect()
            })
            .collect();

        VtGrid {
            rows,
            cols,
            cursor_row: cursor.0,
            cursor_col: cursor.1,
            cursor_visible: !screen.hide_cursor(),
            cells,
        }
    }
}

fn convert_vt100_color(color: vt100::Color) -> Option<Color> {
    match color {
        vt100::Color::Default => None,
        vt100::Color::Idx(i) => Some(Color::Indexed(i)),
        vt100::Color::Rgb(r, g, b) => Some(Color::Rgb(r, g, b)),
    }
}
