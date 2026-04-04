use ratatui::{
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

use crate::app::Focus;

/// Pixel infinity sign rendered as braille dots (4 chars, 8×4 dot grid).
/// Grid:
///   .#  #.  .#  #.
///   #.  .#  #.  .#
///   #.  .#  #.  .#
///   .#  #.  .#  #.
const PIXEL_INFINITY: &str = "\u{288E}\u{2871}\u{288E}\u{2871}";

pub fn render(
    frame: &mut Frame,
    area: Rect,
    message: Option<&str>,
    workspace_name: &str,
    host_label: &str,
    focus: Focus,
) {
    let content = Rect::new(area.x, area.y + area.height.saturating_sub(1), area.width, 1);
    let dim = Style::default().fg(Color::DarkGray);
    let width = content.width as usize;

    // Left side: logo + workspace context (or status message)
    let left_spans = match message {
        Some(msg) if !msg.is_empty() => vec![
            Span::styled(format!(" {PIXEL_INFINITY} "), dim),
            Span::styled(msg.to_string(), Style::default().fg(Color::Yellow)),
        ],
        _ => vec![
            Span::styled(format!(" {PIXEL_INFINITY} "), dim),
            Span::styled(workspace_name.to_string(), dim),
            Span::styled(format!(" · {host_label}"), dim),
        ],
    };

    // Right side: contextual keybind hints
    let hints = match focus {
        Focus::Sidebar => "tab focus · n new · a add repo · g git · q quit",
        Focus::Canvas => "tab focus",
        Focus::Extensions => "tab focus · 1/2 toggle · g git · q quit",
    };
    let right_text = format!("{hints} ");

    // Calculate padding between left and right
    let left_width: usize = left_spans.iter().map(|s| s.width()).sum();
    let right_width = right_text.len();
    let pad = width.saturating_sub(left_width + right_width);

    let mut spans = left_spans;
    spans.push(Span::raw(" ".repeat(pad)));
    spans.push(Span::styled(right_text, dim));

    let bar = Paragraph::new(Line::from(spans));
    frame.render_widget(bar, content);
}
