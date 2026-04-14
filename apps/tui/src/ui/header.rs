use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

use crate::app::{App, AppDialog};

/// Render the org switcher in the sidebar header area.
pub fn render_org(frame: &mut Frame, area: Rect, _app: &App) {
    let content = Rect::new(area.x, area.y, area.width, 1);
    let dim = Style::default().fg(Color::DarkGray);
    let org_name = "Personal";

    let spans = vec![
        Span::styled(" ◆ ", Style::default().fg(Color::Cyan)),
        Span::styled(org_name, Style::default().fg(Color::White)),
        Span::styled(" ▾", dim),
    ];

    let line = Paragraph::new(Line::from(spans));
    frame.render_widget(line, content);
}

/// Render the workspace route header with action buttons.
/// Returns (git_button_rect, stack_button_rect) for click handling.
pub fn render_route(frame: &mut Frame, area: Rect, app: &App) -> (Rect, Rect) {
    let content = Rect::new(area.x, area.y, area.width, 1);
    let dim = Style::default().fg(Color::DarkGray);
    let width = content.width as usize;

    let repo = app.workspace.repo_name.as_deref().unwrap_or("—");
    let ws = &app.workspace.workspace_name;

    let left_spans = vec![
        Span::styled(format!(" {repo}"), Style::default().fg(Color::White)),
        Span::styled(format!(" · {ws}"), dim),
    ];

    // Button labels
    let git_label = match &app.dialog {
        AppDialog::GitCommit(_) => " Git ● ",
        _ => " Git ",
    };
    let stack_running = !app.workspace.services.is_empty()
        && app
            .workspace
            .services
            .iter()
            .any(|s| matches!(s.status.as_str(), "starting" | "ready"));
    let stack_label = if stack_running {
        " ■ Stack "
    } else {
        " ▶ Stack "
    };

    let git_style = match &app.dialog {
        AppDialog::GitCommit(_) => Style::default()
            .fg(Color::Cyan)
            .add_modifier(Modifier::BOLD),
        _ => Style::default().fg(Color::DarkGray),
    };
    let stack_style = if stack_running {
        Style::default().fg(Color::Green)
    } else {
        Style::default().fg(Color::DarkGray)
    };

    let left_width: usize = left_spans.iter().map(|s| s.width()).sum();
    let git_width = git_label.len();
    let stack_width = stack_label.len();
    let right_width = git_width + stack_width + 1; // 1 for trailing space
    let pad = width.saturating_sub(left_width + right_width);

    // Calculate button screen positions
    let git_x = content.x + (left_width + pad) as u16;
    let stack_x = git_x + git_width as u16;

    let git_rect = Rect::new(git_x, content.y, git_width as u16, 1);
    let stack_rect = Rect::new(stack_x, content.y, stack_width as u16, 1);

    let mut spans = left_spans;
    spans.push(Span::raw(" ".repeat(pad)));
    spans.push(Span::styled(git_label, git_style));
    spans.push(Span::styled(stack_label, stack_style));

    let bar = Paragraph::new(Line::from(spans));
    frame.render_widget(bar, content);

    (git_rect, stack_rect)
}
