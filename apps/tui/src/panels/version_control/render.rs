use ratatui::{
    layout::{Constraint, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Tabs},
    Frame,
};

use super::{VcTab, VersionControlPanel};

pub fn render(frame: &mut Frame, area: Rect, panel: &VersionControlPanel, focused: bool) {
    let border_style = if focused {
        Style::default().fg(Color::Cyan)
    } else {
        Style::default().fg(Color::DarkGray)
    };

    if panel.collapsed {
        let header = Paragraph::new(Line::from(vec![
            Span::styled("▶ ", Style::default().fg(Color::DarkGray)),
            Span::styled("Version Control", Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
        ]))
        .block(Block::default().borders(Borders::ALL).border_style(border_style));
        frame.render_widget(header, area);
        return;
    }

    let sections = Layout::vertical([
        Constraint::Length(2), // tab bar
        Constraint::Min(0),   // content
    ])
    .split(area);

    // Tab bar
    let tab_titles: Vec<&str> = VcTab::ALL.iter().map(|t| t.label()).collect();
    let selected = VcTab::ALL.iter().position(|t| *t == panel.active_tab).unwrap_or(0);
    let tabs = Tabs::new(tab_titles)
        .select(selected)
        .style(Style::default().fg(Color::DarkGray))
        .highlight_style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
        .divider("│")
        .block(
            Block::default()
                .title(Line::from(vec![
                    Span::styled(" ▼ ", Style::default().fg(Color::DarkGray)),
                    Span::styled("Version Control ", Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
                ]))
                .borders(Borders::TOP | Borders::LEFT | Borders::RIGHT)
                .border_style(border_style),
        );
    frame.render_widget(tabs, sections[0]);

    // Content
    let content_block = Block::default()
        .borders(Borders::BOTTOM | Borders::LEFT | Borders::RIGHT)
        .border_style(border_style);
    let inner = content_block.inner(sections[1]);
    frame.render_widget(content_block, sections[1]);

    let scroll = panel.scroll;
    match panel.active_tab {
        VcTab::Status => render_status(frame, inner, panel, scroll),
        VcTab::Commits => render_commits(frame, inner, panel, scroll),
    }
}

fn render_status(frame: &mut Frame, area: Rect, panel: &VersionControlPanel, scroll: u16) {
    let git = &panel.git;
    let mut lines: Vec<Line> = Vec::new();

    // Branch + clean/dirty
    let status_icon = if git.dirty { "✗" } else { "✓" };
    let status_color = if git.dirty { Color::Yellow } else { Color::Green };
    lines.push(Line::from(vec![
        Span::styled(&git.branch, Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
        Span::raw(" "),
        Span::styled(status_icon, Style::default().fg(status_color)),
    ]));

    // Ahead/behind
    if git.ahead > 0 || git.behind > 0 {
        lines.push(Line::from(Span::styled(
            format!("↑{} ↓{}", git.ahead, git.behind),
            Style::default().fg(Color::DarkGray),
        )));
    }

    if !git.files.is_empty() {
        lines.push(Line::from(""));
    }

    // Changed files
    for file in &git.files {
        let color = match file.status.as_str() {
            "M" => Color::Yellow,
            "A" => Color::Green,
            "D" => Color::Red,
            "??" => Color::DarkGray,
            _ => Color::White,
        };
        lines.push(Line::from(vec![
            Span::styled(format!("{:<3}", file.status), Style::default().fg(color)),
            Span::styled(&file.path, Style::default().fg(Color::Gray)),
        ]));
    }

    if git.files.is_empty() && !git.dirty {
        lines.push(Line::from(Span::styled(
            "Working tree clean",
            Style::default().fg(Color::DarkGray),
        )));
    }

    let content = Paragraph::new(lines).scroll((scroll, 0));
    frame.render_widget(content, area);
}

fn render_commits(frame: &mut Frame, area: Rect, panel: &VersionControlPanel, scroll: u16) {
    let lines: Vec<Line> = panel
        .git
        .commits
        .iter()
        .map(|c| {
            Line::from(vec![
                Span::styled(&c.sha, Style::default().fg(Color::Yellow)),
                Span::raw(" "),
                Span::styled(&c.message, Style::default().fg(Color::White)),
                Span::raw(" "),
                Span::styled(&c.relative_time, Style::default().fg(Color::DarkGray)),
            ])
        })
        .collect();

    let content = Paragraph::new(if lines.is_empty() {
        vec![Line::from(Span::styled("No commits", Style::default().fg(Color::DarkGray)))]
    } else {
        lines
    }).scroll((scroll, 0));
    frame.render_widget(content, area);
}
