use ratatui::{
    layout::{Constraint, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

use crate::app::{App, Focus};

pub fn render(frame: &mut Frame, area: Rect, app: &App) {
    let sections = Layout::vertical([
        Constraint::Length(8),
        Constraint::Min(7),
        Constraint::Min(0),
    ])
    .split(area);

    let border_style = if app.focus == Focus::Extensions {
        Style::default().fg(Color::Cyan)
    } else {
        Style::default().fg(Color::DarkGray)
    };

    let shell = Paragraph::new(vec![
        detail_line("Backend", &app.shell.backend_label),
        detail_line(
            "Persistent",
            if app.shell.persistent { "yes" } else { "no" },
        ),
        detail_line(
            "Status",
            app.workspace.status.as_deref().unwrap_or("unknown"),
        ),
        detail_line(
            "Path",
            app.workspace
                .cwd
                .as_deref()
                .or(app.workspace.workspace_root.as_deref())
                .unwrap_or("unresolved"),
        ),
    ])
    .block(
        Block::default()
            .title(" Shell ")
            .borders(Borders::ALL)
            .border_style(border_style),
    );
    frame.render_widget(shell, sections[0]);

    let mut service_lines = vec![];
    if app.workspace.services.is_empty() {
        service_lines.push(Line::from(Span::styled(
            "No service data",
            Style::default().fg(Color::DarkGray),
        )));
    } else {
        for service in &app.workspace.services {
            service_lines.push(Line::from(vec![
                Span::styled(
                    format!("{:<12}", service.name),
                    Style::default()
                        .fg(Color::White)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::styled(service.status.clone(), Style::default().fg(Color::Yellow)),
            ]));
            if let Some(url) = &service.preview_url {
                service_lines.push(Line::from(Span::styled(
                    format!("  {url}"),
                    Style::default().fg(Color::DarkGray),
                )));
            }
        }
    }
    let services = Paragraph::new(service_lines).block(
        Block::default()
            .title(" Services ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::DarkGray)),
    );
    frame.render_widget(services, sections[1]);

    let detail_lines = vec![
        detail_line(
            "Source ref",
            app.workspace.source_ref.as_deref().unwrap_or("unknown"),
        ),
        detail_line(
            "Resolution",
            app.workspace
                .resolution_error
                .as_deref()
                .or(app.workspace.resolution_note.as_deref())
                .unwrap_or("ready"),
        ),
    ];
    let details = Paragraph::new(detail_lines).block(
        Block::default()
            .title(" Workspace ")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::DarkGray)),
    );
    frame.render_widget(details, sections[2]);
}

fn detail_line(label: &str, value: &str) -> Line<'static> {
    Line::from(vec![
        Span::styled(format!("{label:<10}"), Style::default().fg(Color::DarkGray)),
        Span::styled(value.to_string(), Style::default().fg(Color::White)),
    ])
}
