use ratatui::{
    layout::{Constraint, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Paragraph, Tabs, Wrap},
    Frame,
};

use super::{GitPullRequestSummary, VcTab, VersionControlPanel};

pub fn render(frame: &mut Frame, area: Rect, panel: &VersionControlPanel, _focused: bool) {
    if panel.collapsed {
        let header = Paragraph::new(Line::from(vec![
            Span::styled(" ▶ ", Style::default().fg(Color::DarkGray)),
            Span::styled(
                "Version Control",
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
            "Version Control",
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

    let tab_titles: Vec<&str> = VcTab::ALL.iter().map(|t| t.label()).collect();
    let selected = VcTab::ALL
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
        VcTab::Status => render_status(frame, content_area, panel, scroll),
        VcTab::PullRequests => render_pull_requests(frame, content_area, panel, scroll),
        VcTab::Commits => render_commits(frame, content_area, panel, scroll),
    }
}

fn render_status(frame: &mut Frame, area: Rect, panel: &VersionControlPanel, scroll: u16) {
    let git = &panel.git;
    let mut lines: Vec<Line> = Vec::new();

    // Branch + clean/dirty
    let status_icon = if git.dirty { "✗" } else { "✓" };
    let status_color = if git.dirty {
        Color::Yellow
    } else {
        Color::Green
    };
    lines.push(Line::from(vec![
        Span::styled(
            &git.branch,
            Style::default()
                .fg(Color::White)
                .add_modifier(Modifier::BOLD),
        ),
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
        let mut spans = vec![
            Span::styled(
                format!("{:<3}", file.status),
                Style::default().fg(git_status_color(&file.status)),
            ),
            Span::styled(&file.path, Style::default().fg(Color::Gray)),
        ];

        if file.insertions.unwrap_or(0) > 0 || file.deletions.unwrap_or(0) > 0 {
            spans.push(Span::raw(" "));
            if let Some(insertions) = file.insertions.filter(|value| *value > 0) {
                spans.push(Span::styled(
                    format!("+{insertions}"),
                    Style::default().fg(Color::Green),
                ));
            }
            if let Some(deletions) = file.deletions.filter(|value| *value > 0) {
                if file.insertions.unwrap_or(0) > 0 {
                    spans.push(Span::raw(" "));
                }
                spans.push(Span::styled(
                    format!("-{deletions}"),
                    Style::default().fg(Color::Red),
                ));
            }
        }

        lines.push(Line::from(spans));
    }

    if git.files.is_empty() && !git.dirty {
        lines.push(Line::from(Span::styled(
            "Working tree clean",
            Style::default().fg(Color::DarkGray),
        )));
    }

    let content = Paragraph::new(lines)
        .scroll((scroll, 0))
        .wrap(Wrap { trim: false });
    frame.render_widget(content, area);
}

fn render_pull_requests(frame: &mut Frame, area: Rect, panel: &VersionControlPanel, scroll: u16) {
    let git = &panel.git;
    let mut lines: Vec<Line<'static>> = Vec::new();
    let current_branch = &git.current_branch;

    if let Some(pr) = &current_branch.pull_request {
        lines.push(Line::from(Span::styled(
            "Current branch",
            Style::default().fg(Color::DarkGray),
        )));
        push_pull_request_summary(&mut lines, pr);
        lines.push(Line::from(vec![
            Span::styled(pr.head_ref_name.clone(), Style::default().fg(Color::Yellow)),
            Span::raw(" -> "),
            Span::styled(pr.base_ref_name.clone(), Style::default().fg(Color::Cyan)),
        ]));
    } else if !current_branch.support.available {
        lines.push(Line::from(Span::styled(
            "PR support unavailable",
            Style::default().fg(Color::DarkGray),
        )));
        if let Some(provider) = &current_branch.support.provider {
            lines.push(Line::from(Span::styled(
                format!("Provider {provider}"),
                Style::default().fg(Color::Gray),
            )));
        }
        if let Some(message) = current_branch
            .support
            .message
            .as_ref()
            .or(current_branch.support.reason.as_ref())
        {
            lines.push(Line::from(Span::styled(
                message.to_string(),
                Style::default().fg(Color::Gray),
            )));
        }
    } else {
        lines.push(Line::from(Span::styled(
            current_branch
                .branch
                .as_ref()
                .map(|branch| format!("No PR for {branch}"))
                .unwrap_or_else(|| "No current branch pull request".to_string()),
            Style::default().fg(Color::DarkGray),
        )));
        if let Some(upstream) = &current_branch.upstream {
            lines.push(Line::from(Span::styled(
                format!("Upstream {upstream}"),
                Style::default().fg(Color::Gray),
            )));
        }
        if let Some(base_ref) = &current_branch.suggested_base_ref {
            lines.push(Line::from(Span::styled(
                format!("Suggested base {base_ref}"),
                Style::default().fg(Color::Gray),
            )));
        }
        if current_branch.has_pull_request_changes == Some(false) {
            lines.push(Line::from(Span::styled(
                "No branch-only changes to open yet",
                Style::default().fg(Color::Gray),
            )));
        }
    }

    let current_branch_pr_number = current_branch.pull_request.as_ref().map(|pr| pr.number);
    let other_pull_requests = git
        .pull_requests
        .pull_requests
        .iter()
        .filter(|pull_request| Some(pull_request.number) != current_branch_pr_number)
        .collect::<Vec<_>>();

    if !other_pull_requests.is_empty() {
        if !lines.is_empty() {
            lines.push(Line::from(""));
        }
        lines.push(Line::from(Span::styled(
            "Open pull requests",
            Style::default().fg(Color::DarkGray),
        )));
        for pull_request in other_pull_requests {
            push_pull_request_summary(&mut lines, pull_request);
        }
    } else if git.pull_requests.support.available && current_branch.pull_request.is_none() {
        if !lines.is_empty() {
            lines.push(Line::from(""));
        }
        lines.push(Line::from(Span::styled(
            "No open pull requests",
            Style::default().fg(Color::DarkGray),
        )));
    }

    let content = Paragraph::new(lines)
        .scroll((scroll, 0))
        .wrap(Wrap { trim: false });
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
        vec![Line::from(Span::styled(
            "No commits",
            Style::default().fg(Color::DarkGray),
        ))]
    } else {
        lines
    })
    .scroll((scroll, 0))
    .wrap(Wrap { trim: false });
    frame.render_widget(content, area);
}

fn git_status_color(status: &str) -> Color {
    if status.contains('?') || status.contains('!') {
        Color::DarkGray
    } else if status.contains('D') {
        Color::Red
    } else if status.contains('A') {
        Color::Green
    } else if status.contains('M') {
        Color::Yellow
    } else if status.contains('R') || status.contains('C') || status.contains('T') {
        Color::Cyan
    } else if status.contains('U') {
        Color::LightRed
    } else {
        Color::White
    }
}

fn push_pull_request_summary(lines: &mut Vec<Line<'static>>, pull_request: &GitPullRequestSummary) {
    lines.push(Line::from(vec![
        Span::styled(
            format!("#{}", pull_request.number),
            Style::default().fg(Color::Yellow),
        ),
        Span::raw(" "),
        Span::styled(
            pull_request.title.clone(),
            Style::default().fg(Color::White),
        ),
    ]));

    lines.push(Line::from(vec![
        Span::styled(
            pull_request_state_label(pull_request).to_string(),
            Style::default().fg(pull_request_state_color(pull_request)),
        ),
        Span::raw(" · "),
        Span::styled(
            pull_request.mergeable.clone(),
            Style::default().fg(mergeable_color(&pull_request.mergeable)),
        ),
        Span::raw(" · "),
        Span::styled(
            pull_request
                .review_decision
                .as_deref()
                .unwrap_or("review_required")
                .to_string(),
            Style::default().fg(review_color(pull_request.review_decision.as_deref())),
        ),
        Span::raw(" · "),
        Span::styled(
            pull_request_checks_label(pull_request),
            Style::default().fg(check_color(&pull_request.checks)),
        ),
    ]));

    lines.push(Line::from(Span::styled(
        format!(
            "@{} · {} -> {}",
            pull_request.author, pull_request.head_ref_name, pull_request.base_ref_name
        ),
        Style::default().fg(Color::Gray),
    )));
}

fn pull_request_state_label(pull_request: &GitPullRequestSummary) -> &str {
    if pull_request.is_draft {
        "draft"
    } else {
        pull_request.state.as_str()
    }
}

fn pull_request_state_color(pull_request: &GitPullRequestSummary) -> Color {
    if pull_request.is_draft {
        Color::DarkGray
    } else {
        match pull_request.state.as_str() {
            "merged" => Color::Green,
            "closed" => Color::Red,
            _ => Color::Cyan,
        }
    }
}

fn mergeable_color(mergeable: &str) -> Color {
    match mergeable {
        "mergeable" => Color::Green,
        "conflicting" => Color::Red,
        _ => Color::Yellow,
    }
}

fn review_color(review_decision: Option<&str>) -> Color {
    match review_decision {
        Some("approved") => Color::Green,
        Some("changes_requested") => Color::Red,
        _ => Color::Yellow,
    }
}

fn pull_request_checks_label(pull_request: &GitPullRequestSummary) -> String {
    let total = pull_request.checks.len();
    if total == 0 {
        return "no checks".to_string();
    }

    let passed = pull_request
        .checks
        .iter()
        .filter(|check| check.status == "success")
        .count();
    let failed = pull_request
        .checks
        .iter()
        .filter(|check| check.status == "failed")
        .count();
    let pending = pull_request
        .checks
        .iter()
        .filter(|check| check.status == "pending")
        .count();

    if failed > 0 {
        format!("{failed} failed")
    } else if pending > 0 {
        format!("{pending} pending")
    } else {
        format!("{passed}/{total} passing")
    }
}

fn check_color(checks: &[super::GitPullRequestCheck]) -> Color {
    if checks.iter().any(|check| check.status == "failed") {
        Color::Red
    } else if checks.iter().any(|check| check.status == "pending") {
        Color::Yellow
    } else if checks.iter().any(|check| check.status == "success") {
        Color::Green
    } else {
        Color::DarkGray
    }
}
