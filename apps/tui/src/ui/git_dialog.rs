use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};

use crate::app::GitDialogState;

const DIALOG_WIDTH: u16 = 50;
const DIALOG_HEIGHT: u16 = 14;

/// Center a dialog rect within the given area.
fn centered_rect(area: Rect, width: u16, height: u16) -> Rect {
    let x = area.x + area.width.saturating_sub(width) / 2;
    let y = area.y + area.height.saturating_sub(height) / 2;
    Rect::new(x, y, width.min(area.width), height.min(area.height))
}

pub fn render(frame: &mut Frame, area: Rect, state: &GitDialogState) {
    let dialog_rect = centered_rect(area, DIALOG_WIDTH, DIALOG_HEIGHT);

    // Clear the area behind the dialog
    frame.render_widget(Clear, dialog_rect);

    let border_style = Style::default().fg(Color::Cyan);
    let block = Block::default()
        .title(" Commit ")
        .borders(Borders::ALL)
        .border_style(border_style);

    let inner = block.inner(dialog_rect);
    frame.render_widget(block, dialog_rect);

    let dim = Style::default().fg(Color::DarkGray);

    let mut lines: Vec<Line> = Vec::new();

    // Branch + file stats row
    let branch = state.branch.as_deref().unwrap_or("—");
    let mut info_spans = vec![
        Span::styled(" ", dim),
        Span::styled(branch, Style::default().fg(Color::Cyan)),
    ];
    if state.staged_count > 0 || state.unstaged_count > 0 {
        let total = state.staged_count + state.unstaged_count;
        info_spans.push(Span::styled(
            format!("  {total} file{}", if total == 1 { "" } else { "s" }),
            dim,
        ));
        if state.insertions > 0 {
            info_spans.push(Span::styled(
                format!("  +{}", state.insertions),
                Style::default().fg(Color::Green),
            ));
        }
        if state.deletions > 0 {
            info_spans.push(Span::styled(
                format!("  -{}", state.deletions),
                Style::default().fg(Color::Red),
            ));
        }
    } else if !state.is_loading {
        info_spans.push(Span::styled("  clean", dim));
    }
    lines.push(Line::from(info_spans));

    // Blank line
    lines.push(Line::from(""));

    // Message label
    lines.push(Line::from(vec![Span::styled(
        " Message",
        Style::default()
            .fg(Color::White)
            .add_modifier(Modifier::BOLD),
    )]));

    // Message input (show cursor)
    let msg_display = if state.commit_message.is_empty() {
        format!(" █")
    } else {
        format!(" {}█", state.commit_message)
    };
    lines.push(Line::from(Span::styled(
        msg_display,
        Style::default().fg(Color::White),
    )));

    // Blank line
    lines.push(Line::from(""));

    // Push toggle
    let toggle = if state.push_after_commit {
        "[●] Push after commit"
    } else {
        "[○] Push after commit"
    };
    lines.push(Line::from(Span::styled(format!(" {toggle}"), dim)));

    // Blank line
    lines.push(Line::from(""));

    // Error if any
    if let Some(ref err) = state.error {
        lines.push(Line::from(Span::styled(
            format!(" {err}"),
            Style::default().fg(Color::Red),
        )));
    }

    // Footer hints
    let has_message = !state.commit_message.trim().is_empty();
    let has_changes = state.staged_count > 0 || state.unstaged_count > 0;
    let can_commit = has_message && has_changes && !state.is_busy;

    let commit_style = if can_commit {
        Style::default().fg(Color::Cyan)
    } else {
        dim
    };

    let busy_hint = if state.is_busy { " working..." } else { "" };

    lines.push(Line::from(vec![
        Span::styled(" esc ", dim),
        Span::styled("close", dim),
        Span::styled("  tab ", dim),
        Span::styled("toggle push", dim),
        Span::styled("  enter ", commit_style),
        Span::styled("commit", commit_style),
        Span::styled(busy_hint.to_string(), Style::default().fg(Color::Yellow)),
    ]));

    let content = Paragraph::new(lines);
    frame.render_widget(content, inner);
}
