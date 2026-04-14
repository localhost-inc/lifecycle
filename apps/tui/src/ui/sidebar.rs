use std::collections::HashMap;

use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

use crate::app::WorkspaceActivity;
use crate::sidebar::{RepoSource, SidebarDialog, SidebarSelection, SidebarState};

pub fn render(
    frame: &mut Frame,
    area: Rect,
    state: &mut SidebarState,
    focused: bool,
    hover_row: Option<u16>,
    spinner: Option<char>,
    activity: &HashMap<String, WorkspaceActivity>,
) {
    // The [+] lives in the title bar — clickable on the title row
    state.add_repo_button_row = Some(area.y);

    let tree_area = area;
    let mut lines: Vec<Line> = Vec::new();
    state.repo_button_rows.clear();
    state.workspace_rows.clear();

    // Title row
    let is_title_hovered = hover_row == Some(area.y);
    let plus_style = if is_title_hovered {
        Style::default().fg(Color::Cyan)
    } else {
        Style::default().fg(Color::DarkGray)
    };
    let title_label = " Repositories";
    let title_btn = "[+] ";
    let title_pad = (tree_area.width as usize).saturating_sub(title_label.len() + title_btn.len());
    lines.push(Line::from(vec![
        Span::styled(
            title_label,
            Style::default()
                .fg(Color::White)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw(" ".repeat(title_pad)),
        Span::styled(title_btn, plus_style),
    ]));

    for (ri, repo) in state.repos.iter().enumerate() {
        // Screen row = tree_area.y + lines.len() (flush, no border offset)
        state
            .repo_button_rows
            .push((ri, tree_area.y + lines.len() as u16));
        let is_selected = state.selected == Some(SidebarSelection::Repo(ri));
        let icon = if repo.expanded { "▼" } else { "▶" };
        let source_tag = match repo.source {
            RepoSource::Local => "",
            RepoSource::Cloud => " ☁",
        };

        let style = if is_selected && focused {
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD)
        } else if is_selected {
            Style::default()
                .fg(Color::White)
                .add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(Color::White)
        };

        let mut spans = vec![
            Span::styled(format!(" {icon} "), Style::default().fg(Color::DarkGray)),
            Span::styled(repo.name.clone(), style),
            Span::styled(source_tag.to_string(), Style::default().fg(Color::DarkGray)),
        ];

        let repo_row = tree_area.y + lines.len() as u16;
        let is_hovered = hover_row == Some(repo_row);
        if is_hovered || (is_selected && focused) {
            let inner_width = tree_area.width as usize;
            let used: usize = spans.iter().map(|s| s.width()).sum();
            let btn = "[+] ";
            let pad = inner_width.saturating_sub(used + btn.len());
            spans.push(Span::raw(" ".repeat(pad)));
            spans.push(Span::styled(
                btn,
                Style::default().fg(if is_hovered {
                    Color::Cyan
                } else {
                    Color::DarkGray
                }),
            ));
        }

        lines.push(Line::from(spans));

        if repo.expanded {
            // New workspace dialog renders at top of list, right under repo header
            if let Some(SidebarDialog::NewWorkspace {
                repo_index,
                ref input,
            }) = &state.dialog
            {
                if *repo_index == ri {
                    let mut spans = vec![Span::styled("   + ", Style::default().fg(Color::Cyan))];
                    if input.is_empty() {
                        spans.push(Span::styled("█", Style::default().fg(Color::Cyan)));
                        spans.push(Span::styled(
                            "workspace name…",
                            Style::default().fg(Color::DarkGray),
                        ));
                    } else {
                        spans.push(Span::styled(
                            input.clone(),
                            Style::default().fg(Color::White),
                        ));
                        spans.push(Span::styled("█", Style::default().fg(Color::Cyan)));
                    }
                    lines.push(Line::from(spans));
                }
            }

            for (wi, ws) in repo.workspaces.iter().enumerate() {
                state
                    .workspace_rows
                    .push((ri, wi, tree_area.y + lines.len() as u16));
                let is_ws_selected = state.selected == Some(SidebarSelection::Workspace(ri, wi));

                let status_color = match ws.status.as_str() {
                    "active" => Color::Green,
                    "provisioning" => Color::Yellow,
                    "failed" => Color::Red,
                    _ => Color::DarkGray,
                };

                let ws_style = if is_ws_selected && focused {
                    Style::default().fg(Color::Cyan)
                } else if is_ws_selected {
                    Style::default().fg(Color::White)
                } else {
                    Style::default().fg(Color::Gray)
                };

                let ws_row = tree_area.y + lines.len() as u16;
                let ws_hovered = hover_row == Some(ws_row);

                let ws_key = format!("{}\t{}", repo.name, ws.name);
                let ws_activity = activity
                    .get(&ws_key)
                    .copied()
                    .unwrap_or(WorkspaceActivity::Idle);

                let (indicator, indicator_style) = match ws_activity {
                    WorkspaceActivity::Busy => {
                        if let Some(ch) = spinner {
                            (format!("{ch} "), Style::default().fg(Color::Cyan))
                        } else {
                            ("● ".to_string(), Style::default().fg(Color::Cyan))
                        }
                    }
                    WorkspaceActivity::Attention => {
                        ("● ".to_string(), Style::default().fg(Color::Yellow))
                    }
                    WorkspaceActivity::Idle => {
                        ("● ".to_string(), Style::default().fg(status_color))
                    }
                };

                let mut ws_spans = vec![
                    Span::raw("   "),
                    Span::styled(indicator, indicator_style),
                    Span::styled(ws.name.clone(), ws_style),
                ];

                if ws_hovered {
                    let inner_width = tree_area.width as usize;
                    let used: usize = ws_spans.iter().map(|s| s.width()).sum();
                    let btn = "[x] ";
                    let pad = inner_width.saturating_sub(used + btn.len());
                    ws_spans.push(Span::raw(" ".repeat(pad)));
                    ws_spans.push(Span::styled(btn, Style::default().fg(Color::Red)));
                }

                lines.push(Line::from(ws_spans));
            }

            if repo.workspaces.is_empty() && repo.path.is_some() {
                lines.push(Line::from(Span::styled(
                    "   (no workspaces)",
                    Style::default().fg(Color::DarkGray),
                )));
            }

            // Inline dialogs (confirm delete stays at bottom)
            if let Some(SidebarDialog::ConfirmDelete {
                repo_index,
                ws_index: _,
                ref message,
            }) = &state.dialog
            {
                if *repo_index == ri {
                    lines.push(Line::from(Span::styled(
                        format!("   {message}"),
                        Style::default().fg(Color::Yellow),
                    )));
                }
            }
        }

        // Gap between repos
        if ri + 1 < state.repos.len() {
            lines.push(Line::from(""));
        }
    }

    let tree = Paragraph::new(lines);
    frame.render_widget(tree, tree_area);
}
