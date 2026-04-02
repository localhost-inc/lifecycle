use ratatui::{
    buffer::Buffer,
    layout::Rect,
    style::{Color, Modifier, Style},
    text::Text,
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};

use crate::app::{App, Focus};
use crate::vt::VtGrid;

pub fn render(frame: &mut Frame, area: Rect, app: &App, grid: &VtGrid, notice: Option<&str>) {
    let border_style = if app.focus == Focus::Canvas {
        Style::default().fg(Color::Cyan)
    } else {
        Style::default().fg(Color::DarkGray)
    };

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(border_style);

    let inner = block.inner(area);
    frame.render_widget(block, area);

    if let Some(message) = notice {
        if grid.rows == 0 || app.pty.is_none() {
            let paragraph = Paragraph::new(Text::from(message.to_string()))
                .style(Style::default().fg(Color::DarkGray))
                .wrap(Wrap { trim: true });
            frame.render_widget(paragraph, inner);
            return;
        }
    }

    let show_cursor = app.focus == Focus::Canvas;
    render_vt_grid(frame.buffer_mut(), inner, grid, show_cursor);
}

fn render_vt_grid(buf: &mut Buffer, area: Rect, grid: &VtGrid, show_cursor: bool) {
    for row in 0..area.height.min(grid.rows) {
        for col in 0..area.width.min(grid.cols) {
            if let Some(cells_row) = grid.cells.get(row as usize) {
                if let Some(cell) = cells_row.get(col as usize) {
                    let x = area.x + col;
                    let y = area.y + row;

                    if x < area.right() && y < area.bottom() {
                        let mut style = Style::default();
                        if let Some(fg) = cell.fg {
                            style = style.fg(fg);
                        }
                        if let Some(bg) = cell.bg {
                            style = style.bg(bg);
                        }
                        if cell.bold {
                            style = style.add_modifier(Modifier::BOLD);
                        }
                        if cell.italic {
                            style = style.add_modifier(Modifier::ITALIC);
                        }
                        if cell.underline {
                            style = style.add_modifier(Modifier::UNDERLINED);
                        }
                        if cell.inverse {
                            style = style.add_modifier(Modifier::REVERSED);
                        }

                        if show_cursor
                            && grid.cursor_visible
                            && row == grid.cursor_row
                            && col == grid.cursor_col
                        {
                            style = style.add_modifier(Modifier::REVERSED);
                        }

                        let buf_cell = &mut buf[(x, y)];
                        buf_cell.set_char(cell.ch);
                        buf_cell.set_style(style);
                    }
                }
            }
        }
    }
}
