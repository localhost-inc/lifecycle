use ratatui::{
    layout::{Constraint, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Paragraph, Tabs},
    Frame,
};

use super::{EnvTab, EnvironmentPanel};

pub fn render(frame: &mut Frame, area: Rect, panel: &EnvironmentPanel, _focused: bool) {
    if panel.collapsed {
        let header = Paragraph::new(Line::from(vec![
            Span::styled(" ▶ ", Style::default().fg(Color::DarkGray)),
            Span::styled(
                "Environment",
                Style::default()
                    .fg(Color::White)
                    .add_modifier(Modifier::BOLD),
            ),
        ]));
        frame.render_widget(header, area);
        return;
    }

    let sections = Layout::vertical([
        Constraint::Length(2), // tab bar
        Constraint::Min(0),    // content
    ])
    .split(area);

    // Tab bar — title line + tabs on second line
    let title = Paragraph::new(Line::from(vec![
        Span::styled(" ▼ ", Style::default().fg(Color::DarkGray)),
        Span::styled(
            "Environment",
            Style::default()
                .fg(Color::White)
                .add_modifier(Modifier::BOLD),
        ),
    ]));
    let title_area = Rect {
        height: 1,
        ..sections[0]
    };
    frame.render_widget(title, title_area);

    let tab_titles: Vec<&str> = EnvTab::ALL.iter().map(|t| t.label()).collect();
    let selected = EnvTab::ALL
        .iter()
        .position(|t| *t == panel.active_tab)
        .unwrap_or(0);
    let tabs = Tabs::new(tab_titles)
        .select(selected)
        .style(Style::default().fg(Color::DarkGray))
        .highlight_style(
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        )
        .divider("│");
    let tab_area = Rect {
        y: sections[0].y + 1,
        height: 1,
        ..sections[0]
    };
    frame.render_widget(tabs, tab_area);

    // Content
    let scroll = panel.scroll;
    let content_area = Rect {
        x: sections[1].x + 1,
        width: sections[1].width.saturating_sub(1),
        ..sections[1]
    };
    match panel.active_tab {
        EnvTab::Services => render_services(frame, content_area, panel, scroll),
        EnvTab::Logs => render_logs(frame, content_area, panel, scroll),
    }
}

fn render_services(frame: &mut Frame, area: Rect, panel: &EnvironmentPanel, scroll: u16) {
    if panel.services.is_empty() {
        let content = Paragraph::new(Line::from(Span::styled(
            "No services",
            Style::default().fg(Color::DarkGray),
        )));
        frame.render_widget(content, area);
        return;
    }

    let lines: Vec<Line> = panel
        .services
        .iter()
        .map(|s| {
            let status_color = match s.status.as_str() {
                "ready" => Color::Green,
                "starting" => Color::Yellow,
                "failed" => Color::Red,
                "stopped" => Color::DarkGray,
                _ => Color::White,
            };
            let indicator = match s.status.as_str() {
                "ready" => "●",
                "starting" => "◐",
                "failed" => "✗",
                _ => "○",
            };

            let mut spans = vec![
                Span::styled(format!("{indicator} "), Style::default().fg(status_color)),
                Span::styled(format!("{:<12}", s.name), Style::default().fg(Color::White)),
                Span::styled(&s.status, Style::default().fg(status_color)),
            ];

            if let Some(port) = s.port {
                spans.push(Span::styled(
                    format!("  :{port}"),
                    Style::default().fg(Color::DarkGray),
                ));
            }

            Line::from(spans)
        })
        .collect();

    let content = Paragraph::new(lines).scroll((scroll, 0));
    frame.render_widget(content, area);
}

fn render_logs(frame: &mut Frame, area: Rect, panel: &EnvironmentPanel, scroll: u16) {
    if panel.logs.is_empty() {
        let content = Paragraph::new(Line::from(Span::styled(
            "No logs",
            Style::default().fg(Color::DarkGray),
        )));
        frame.render_widget(content, area);
        return;
    }

    let lines: Vec<Line> = panel
        .logs
        .iter()
        .rev()
        .take(area.height as usize)
        .map(|l| {
            let style = if l.is_error {
                Style::default().fg(Color::Red)
            } else {
                Style::default().fg(Color::Gray)
            };
            Line::from(vec![
                Span::styled(
                    format!("{:<8}", l.service),
                    Style::default().fg(Color::DarkGray),
                ),
                Span::styled(&l.text, style),
            ])
        })
        .collect();

    let content = Paragraph::new(lines).scroll((scroll, 0));
    frame.render_widget(content, area);
}
