mod debug;
mod app;
mod bridge;
mod events;
mod panels;
mod selection;
mod shell;
mod sidebar;
mod terminal;
mod ui;
mod vt;

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use crossterm::{
    event::{
        self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEvent, KeyModifiers,
        MouseButton, MouseEvent, MouseEventKind,
    },
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{backend::CrosstermBackend, layout::Rect, Terminal};

use app::{App, Focus};
use vt::{VtMouseAction, VtMouseButton, VtMouseEvent};

/// Restore the host terminal to a usable state.
fn restore_terminal() {
    // Write escape sequences WHILE STILL IN RAW MODE — disabling raw mode
    // first re-enables output processing (OPOST) which can corrupt them.
    let _ = execute!(
        std::io::stdout(),
        DisableMouseCapture,
        LeaveAlternateScreen,
        crossterm::cursor::Show
    );
    let _ = std::io::Write::flush(&mut std::io::stdout());
    let _ = disable_raw_mode();

    // Belt-and-suspenders: if crossterm's restore failed (or was a no-op),
    // force the terminal back to cooked mode via libc so the shell prompt
    // is usable even after a messy exit.
    #[cfg(unix)]
    {
        unsafe {
            let mut attrs: libc::termios = std::mem::zeroed();
            if libc::tcgetattr(libc::STDIN_FILENO, &mut attrs) == 0 {
                attrs.c_lflag |= libc::ECHO | libc::ICANON | libc::ISIG | libc::IEXTEN;
                attrs.c_iflag |= libc::ICRNL;
                attrs.c_oflag |= libc::OPOST;
                libc::tcsetattr(libc::STDIN_FILENO, libc::TCSANOW, &attrs);
            }
        }
    }
}

fn main() -> anyhow::Result<()> {
    debug::init();
    debug::log("main start");

    // Suppress libghostty info logging by redirecting stderr to /dev/null
    suppress_stderr();

    // --- safety nets so we never leave the terminal in raw mode ---

    // 1. Panic hook — restores terminal before printing the panic.
    let original_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        crate::debug::log(format!("panic: {info}"));
        restore_terminal();
        original_hook(info);
    }));

    // 2. SIGINT / SIGTERM — set a flag so the main loop exits cleanly.
    //    This covers `cargo watch` killing us on file-change and Ctrl-C
    //    propagating through the process group.
    let sigint = std::sync::Arc::new(AtomicBool::new(false));
    signal_hook::flag::register(signal_hook::consts::SIGINT, sigint.clone())?;
    signal_hook::flag::register(signal_hook::consts::SIGTERM, sigint.clone())?;

    // Force a clean terminal state on startup — handles restarts from
    // cargo watch where the previous process may have left the terminal
    // in alternate screen / raw mode / mouse capture enabled.
    let _ = disable_raw_mode();
    let mut stdout = std::io::stdout();
    let _ = execute!(
        stdout,
        DisableMouseCapture,
        LeaveAlternateScreen,
        crossterm::cursor::Show
    );

    enable_raw_mode()?;
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut term = Terminal::new(backend)?;
    term.clear()?;

    // Run the app inside a closure so restore_terminal() is always called,
    // even if App::new() fails (missing bridge env vars, etc.).
    let result = (|| -> anyhow::Result<()> {
        let mut app = App::new().map_err(anyhow::Error::msg)?;
        debug::log("app created");

        let result = run_loop(&mut term, &mut app, &sigint);

        // Drop the PTY before restoring terminal — kills the child process.
        drop(app.pty.take());

        result
    })();

    restore_terminal();

    // Print the error to the now-restored terminal. stderr was redirected
    // to /dev/null for libghostty, so use stdout (alternate screen is gone).
    if let Err(ref e) = result {
        println!("lifecycle-tui: {e}");
    }

    result
}

/// Redirect stderr to /dev/null so libghostty's info logging doesn't pollute the TUI.
fn suppress_stderr() {
    #[cfg(unix)]
    {
        if std::env::var_os("LIFECYCLE_TUI_DEBUG_STDERR").is_some() {
            return;
        }
        use std::os::unix::io::AsRawFd;
        if let Ok(devnull) = std::fs::File::open("/dev/null") {
            unsafe {
                libc::dup2(devnull.as_raw_fd(), 2);
            }
        }
    }
}

fn run_loop(
    term: &mut Terminal<CrosstermBackend<std::io::Stdout>>,
    app: &mut App,
    sigint: &AtomicBool,
) -> anyhow::Result<()> {
    let mut cached_width: u16 = term.size()?.width;
    crate::debug::log(format!("run_loop start width={cached_width}"));

    while app.running && !sigint.load(Ordering::Relaxed) {
        // 1. Wait for at least one event or a short timeout (for PTY output).
        let has_event = event::poll(Duration::from_millis(4))?;

        // 2. Drain ALL pending events in one shot.
        if has_event {
            loop {
                match event::read()? {
                    Event::Key(key) => handle_key(app, key),
                    Event::Mouse(mouse) => {
                        crate::debug::log(format!("mouse event: {:?}", mouse));
                        handle_mouse(app, mouse, cached_width)
                    }
                    Event::Resize(w, _) => {
                        cached_width = w;
                        crate::debug::log(format!("resize event width={w}"));
                    }
                    _ => {}
                }
                app.needs_draw = true;
                if !event::poll(Duration::ZERO)? {
                    break;
                }
            }
        }

        // 3. Drain PTY output + background tasks + activity poll + spinner.
        app.process_pty();
        if app.poll_bridge_events() {
            app.needs_draw = true;
        }
        let (sidebar_changed, sidebar_error) = app.sidebar_state.poll_background();
        if sidebar_changed {
            app.needs_draw = true;
        }
        if let Some(err) = sidebar_error {
            app.set_status(err, 5);
        }
        if app.tick_spinner() || app.tick_status() {
            app.needs_draw = true;
        }

        // Poll git background messages
        if app.poll_git_bg() {
            app.needs_draw = true;
        }

        // 4. Draw only when something changed.
        if app.needs_draw {
            app.needs_draw = false;
            term.draw(|frame| {
                let rows = ratatui::layout::Layout::vertical([
                    ratatui::layout::Constraint::Length(1),
                    ratatui::layout::Constraint::Min(0),
                    ratatui::layout::Constraint::Length(1),
                ])
                .split(frame.area());
                let columns = ratatui::layout::Layout::horizontal([
                    ratatui::layout::Constraint::Length(app.sidebar_width),
                    ratatui::layout::Constraint::Length(1), // left divider
                    ratatui::layout::Constraint::Min(app::MIN_CANVAS_WIDTH),
                    ratatui::layout::Constraint::Length(1), // right divider
                    ratatui::layout::Constraint::Length(app.extensions_width),
                ])
                .split(rows[1]);
                let canvas_rect = columns[2];
                crate::debug::log(format!(
                    "draw canvas rect={}x{}+{},{}",
                    canvas_rect.width, canvas_rect.height, canvas_rect.x, canvas_rect.y
                ));
                app.ensure_canvas_pty(canvas_rect.height, canvas_rect.width);

                app.render(frame);
            })?;
        }
    }

    Ok(())
}

fn handle_key(app: &mut App, key: KeyEvent) {
    // Global quit: Ctrl+Q always exits, even when the canvas owns input.
    if key.code == KeyCode::Char('q') && key.modifiers.contains(KeyModifiers::CONTROL) {
        app.running = false;
        return;
    }

    // Dialog intercepts all keys when open.
    if matches!(app.dialog, app::AppDialog::GitCommit(_)) {
        handle_git_dialog_key(app, key);
        return;
    }

    // When the terminal canvas has focus it owns ALL keys — nothing is intercepted.
    // Switch away from canvas via mouse click on another panel.
    if app.focus == Focus::Canvas {
        handle_canvas_key(app, key);
        return;
    }

    if key.code == KeyCode::Tab {
        app.focus = if key.modifiers.contains(KeyModifiers::SHIFT) {
            app.focus.prev()
        } else {
            app.focus.next()
        };
        return;
    }

    match app.focus {
        Focus::Canvas => unreachable!(),
        Focus::Sidebar => handle_sidebar_key(app, key),
        Focus::Extensions => handle_extensions_key(app, key),
    }
}

fn handle_mouse(app: &mut App, mouse: MouseEvent, total_width: u16) {
    if let Some(border) = app.border_at(mouse.column) {
        match mouse.kind {
            MouseEventKind::Down(MouseButton::Left) => {
                app.dragging = Some(border);
                return;
            }
            MouseEventKind::Drag(MouseButton::Left) => {
                if app.dragging.is_some() {
                    app.handle_drag(mouse.column, total_width);
                }
                return;
            }
            MouseEventKind::Up(MouseButton::Left) => {
                if app.dragging.is_some() {
                    app.dragging = None;
                    app.flush_pending_resize();
                }
                return;
            }
            _ => {}
        }
    }

    if let Some(events) = translate_canvas_mouse_event(
        app.canvas_inner_rect(),
        mouse,
        app.focus == Focus::Canvas,
    ) {
        app.focus = Focus::Canvas;
        for event in &events {
            app.write_mouse_to_pty(event);
        }
        return;
    }

    match mouse.kind {
        MouseEventKind::Down(MouseButton::Left) => {
            // Header button clicks (git, stack)
            let gr = app.git_button_rect;
            if mouse.row == gr.y
                && mouse.column >= gr.x
                && mouse.column < gr.x + gr.width
            {
                if matches!(app.dialog, app::AppDialog::GitCommit(_)) {
                    app.dialog = app::AppDialog::None;
                } else {
                    app.open_git_dialog();
                }
                return;
            }
            let sr = app.stack_button_rect;
            if mouse.row == sr.y
                && mouse.column >= sr.x
                && mouse.column < sr.x + sr.width
            {
                app.toggle_stack();
                return;
            }

            // Check sidebar button clicks
            if mouse.column < app.sidebar_width {
                // Header [+] — add repo
                if let Some(btn_row) = app.sidebar_state.add_repo_button_row {
                    if mouse.row == btn_row {
                        app.sidebar_state.add_repo_via_picker();
                        return;
                    }
                }
                // Repo row — [+] zone on right creates workspace, rest toggles expand
                let plus_zone = app.sidebar_width.saturating_sub(5);
                if let Some(ri) = app.sidebar_state.repo_at_row(mouse.row) {
                    app.sidebar_state.selected = Some(crate::sidebar::SidebarSelection::Repo(ri));
                    app.focus = Focus::Sidebar;
                    if mouse.column >= plus_zone {
                        app.sidebar_state.handle_repo_button_click(mouse.row);
                    } else {
                        app.sidebar_state.toggle_expand();
                    }
                    return;
                }
                // Workspace row — check [x] delete zone (right 4 cols) vs activate
                let delete_zone = app.sidebar_width.saturating_sub(5);
                if mouse.column >= delete_zone {
                    if app.sidebar_state.handle_workspace_delete_click(mouse.row) {
                        app.focus = Focus::Sidebar;
                        return;
                    }
                }
                if app.sidebar_state.handle_workspace_click(mouse.row) {
                    app.activate_selected_workspace();
                    app.focus = Focus::Canvas;
                    return;
                }
            }

            // Right column panel clicks
            if mouse.column >= app.col_rects[2].x {
                let vc = app.vc_panel_rect;
                let env = app.env_panel_rect;
                let collapse_zone = app.col_rects[2].x + 4; // ▼ arrow area

                // VC panel header row
                if mouse.row >= vc.y && mouse.row < vc.y + 2 {
                    app.focus = Focus::Extensions;
                    if app.vc_panel.collapsed {
                        app.vc_panel.toggle_collapsed();
                    } else if mouse.column < collapse_zone {
                        app.vc_panel.toggle_collapsed();
                    } else {
                        app.vc_panel.next_tab();
                    }
                    return;
                }

                // Env panel header row
                if mouse.row >= env.y && mouse.row < env.y + 2 {
                    app.focus = Focus::Extensions;
                    if app.env_panel.collapsed {
                        app.env_panel.toggle_collapsed();
                    } else if mouse.column < collapse_zone {
                        app.env_panel.toggle_collapsed();
                    } else {
                        app.env_panel.next_tab();
                    }
                    return;
                }
            }

            if let Some(focus) = app.focus_at(mouse.column, mouse.row) {
                app.focus = focus;
            }
        }
        MouseEventKind::Drag(MouseButton::Left) => {
            if app.dragging.is_some() {
                app.handle_drag(mouse.column, total_width);
            }
        }
        MouseEventKind::Up(MouseButton::Left) => {
            if app.dragging.is_some() {
                app.dragging = None;
                app.flush_pending_resize();
            }
        }
        MouseEventKind::ScrollUp => {
            if mouse.column >= app.col_rects[2].x {
                // Right column — scroll whichever panel the mouse is in
                let vc = app.vc_panel_rect;
                let env = app.env_panel_rect;
                if mouse.row >= vc.y && mouse.row < vc.y + vc.height {
                    app.vc_panel.scroll_up();
                } else if mouse.row >= env.y && mouse.row < env.y + env.height {
                    app.env_panel.scroll_up();
                }
            } else if app.focus == Focus::Canvas {
                app.write_to_pty(b"\x1b[5~");
            }
        }
        MouseEventKind::ScrollDown => {
            if mouse.column >= app.col_rects[2].x {
                let vc = app.vc_panel_rect;
                let env = app.env_panel_rect;
                if mouse.row >= vc.y && mouse.row < vc.y + vc.height {
                    app.vc_panel.scroll_down();
                } else if mouse.row >= env.y && mouse.row < env.y + env.height {
                    app.env_panel.scroll_down();
                }
            } else if app.focus == Focus::Canvas {
                app.write_to_pty(b"\x1b[6~");
            }
        }
        MouseEventKind::Moved => {
            if mouse.column < app.sidebar_width {
                let prev = app.mouse_row;
                app.mouse_row = Some(mouse.row);
                if prev != app.mouse_row {
                    app.needs_draw = true;
                }
            } else if app.mouse_row.is_some() {
                app.mouse_row = None;
                app.needs_draw = true;
            }
        }
        _ => {}
    }
}

fn translate_canvas_mouse_event(
    canvas: Rect,
    mouse: MouseEvent,
    _canvas_focused: bool,
) -> Option<Vec<VtMouseEvent>> {
    let x = mouse.column.checked_sub(canvas.x)?;
    let y = mouse.row.checked_sub(canvas.y)?;
    if x >= canvas.width || y >= canvas.height {
        return None;
    }

    let base = VtMouseEvent {
        action: VtMouseAction::Press,
        button: None,
        x,
        y,
        shift: mouse.modifiers.contains(KeyModifiers::SHIFT),
        alt: mouse.modifiers.contains(KeyModifiers::ALT),
        control: mouse.modifiers.contains(KeyModifiers::CONTROL),
    };

    match mouse.kind {
        MouseEventKind::Down(button) => Some(vec![VtMouseEvent {
            action: VtMouseAction::Press,
            button: map_mouse_button(button),
            ..base
        }]),
        MouseEventKind::Up(button) => Some(vec![VtMouseEvent {
            action: VtMouseAction::Release,
            button: map_mouse_button(button),
            ..base
        }]),
        MouseEventKind::Drag(button) => Some(vec![VtMouseEvent {
            action: VtMouseAction::Motion,
            button: map_mouse_button(button),
            ..base
        }]),
        MouseEventKind::ScrollUp => Some(vec![
            VtMouseEvent {
                action: VtMouseAction::Press,
                button: Some(VtMouseButton::WheelUp),
                ..base
            },
            VtMouseEvent {
                action: VtMouseAction::Release,
                button: Some(VtMouseButton::WheelUp),
                ..base
            },
        ]),
        MouseEventKind::ScrollDown => Some(vec![
            VtMouseEvent {
                action: VtMouseAction::Press,
                button: Some(VtMouseButton::WheelDown),
                ..base
            },
            VtMouseEvent {
                action: VtMouseAction::Release,
                button: Some(VtMouseButton::WheelDown),
                ..base
            },
        ]),
        _ => None,
    }
}

fn map_mouse_button(button: MouseButton) -> Option<VtMouseButton> {
    match button {
        MouseButton::Left => Some(VtMouseButton::Left),
        MouseButton::Right => Some(VtMouseButton::Right),
        MouseButton::Middle => Some(VtMouseButton::Middle),
    }
}

fn handle_git_dialog_key(app: &mut App, key: KeyEvent) {
    match key.code {
        KeyCode::Esc => {
            app.dialog = app::AppDialog::None;
        }
        KeyCode::Enter => {
            app.execute_git_commit();
        }
        KeyCode::Tab => {
            if let app::AppDialog::GitCommit(ref mut state) = app.dialog {
                state.push_after_commit = !state.push_after_commit;
            }
        }
        KeyCode::Backspace => {
            if let app::AppDialog::GitCommit(ref mut state) = app.dialog {
                state.commit_message.pop();
            }
        }
        KeyCode::Char(ch) => {
            if let app::AppDialog::GitCommit(ref mut state) = app.dialog {
                state.commit_message.push(ch);
            }
        }
        _ => {}
    }
}

fn handle_canvas_key(app: &mut App, key: KeyEvent) {
    if app.write_key_to_pty(key) {
        return;
    }

    let bytes = legacy_key_to_bytes(key);
    if !bytes.is_empty() {
        app.write_to_pty(&bytes);
    }
}

fn handle_sidebar_key(app: &mut App, key: KeyEvent) {
    if app.sidebar_state.has_dialog() {
        use crate::sidebar::SidebarDialog;
        match &app.sidebar_state.dialog {
            Some(SidebarDialog::ConfirmDelete { .. }) => match key.code {
                KeyCode::Char('y') => app.sidebar_state.dialog_confirm(true),
                KeyCode::Char('n') | KeyCode::Esc => app.sidebar_state.dialog_confirm(false),
                _ => {}
            },
            Some(SidebarDialog::NewWorkspace { .. }) => match key.code {
                KeyCode::Esc => app.sidebar_state.dialog_cancel(),
                KeyCode::Enter => app.sidebar_state.dialog_submit(),
                KeyCode::Backspace => app.sidebar_state.dialog_backspace(),
                KeyCode::Char(ch) => app.sidebar_state.dialog_input(ch),
                _ => {}
            },
            None => {}
        }
        return;
    }

    match key.code {
        KeyCode::Char('q') => app.running = false,
        KeyCode::Char('j') | KeyCode::Down => app.sidebar_state.move_down(),
        KeyCode::Char('k') | KeyCode::Up => app.sidebar_state.move_up(),
        KeyCode::Enter | KeyCode::Char(' ') => {
            if app.sidebar_state.selected_workspace().is_some() {
                app.activate_selected_workspace();
            } else {
                app.sidebar_state.toggle_expand();
            }
        }
        KeyCode::Char('a') => app.sidebar_state.add_repo_via_picker(),
        KeyCode::Char('n') => app.sidebar_state.start_new_workspace_dialog(),
        KeyCode::Char('g') => app.open_git_dialog(),
        _ => {}
    }
}

fn handle_extensions_key(app: &mut App, key: KeyEvent) {
    match key.code {
        KeyCode::Char('q') => app.running = false,
        KeyCode::Char('1') => app.vc_panel.toggle_collapsed(),
        KeyCode::Char('2') => app.env_panel.toggle_collapsed(),
        KeyCode::Left | KeyCode::Char('h') => {
            app.vc_panel.prev_tab();
            app.env_panel.prev_tab();
        }
        KeyCode::Right | KeyCode::Char('l') => {
            app.vc_panel.next_tab();
            app.env_panel.next_tab();
        }
        KeyCode::Char('g') => app.open_git_dialog(),
        _ => {}
    }
}

fn legacy_key_to_bytes(key: KeyEvent) -> Vec<u8> {
    let has_alt = key.modifiers.contains(KeyModifiers::ALT);

    let base = match key.code {
        KeyCode::Char(c) => {
            if key.modifiers.contains(KeyModifiers::CONTROL) {
                // Ctrl+letter → 0x01..0x1a
                let lower = c.to_ascii_lowercase() as u8;
                let ctrl = lower.wrapping_sub(b'a').wrapping_add(1);
                vec![ctrl]
            } else {
                let mut buf = [0u8; 4];
                let s = c.encode_utf8(&mut buf);
                s.as_bytes().to_vec()
            }
        }
        KeyCode::Enter => vec![b'\r'],
        KeyCode::Backspace => vec![0x7f],
        KeyCode::Esc => vec![0x1b],
        KeyCode::Tab => vec![b'\t'],
        KeyCode::BackTab => b"\x1b[Z".to_vec(),
        KeyCode::Up => b"\x1b[A".to_vec(),
        KeyCode::Down => b"\x1b[B".to_vec(),
        KeyCode::Right => b"\x1b[C".to_vec(),
        KeyCode::Left => b"\x1b[D".to_vec(),
        KeyCode::Home => b"\x1b[H".to_vec(),
        KeyCode::End => b"\x1b[F".to_vec(),
        KeyCode::Insert => b"\x1b[2~".to_vec(),
        KeyCode::Delete => b"\x1b[3~".to_vec(),
        KeyCode::PageUp => b"\x1b[5~".to_vec(),
        KeyCode::PageDown => b"\x1b[6~".to_vec(),
        KeyCode::F(1) => b"\x1bOP".to_vec(),
        KeyCode::F(2) => b"\x1bOQ".to_vec(),
        KeyCode::F(3) => b"\x1bOR".to_vec(),
        KeyCode::F(4) => b"\x1bOS".to_vec(),
        KeyCode::F(5) => b"\x1b[15~".to_vec(),
        KeyCode::F(6) => b"\x1b[17~".to_vec(),
        KeyCode::F(7) => b"\x1b[18~".to_vec(),
        KeyCode::F(8) => b"\x1b[19~".to_vec(),
        KeyCode::F(9) => b"\x1b[20~".to_vec(),
        KeyCode::F(10) => b"\x1b[21~".to_vec(),
        KeyCode::F(11) => b"\x1b[23~".to_vec(),
        KeyCode::F(12) => b"\x1b[24~".to_vec(),
        _ => vec![],
    };

    if has_alt && !base.is_empty() {
        // Alt is encoded as ESC prefix
        let mut out = vec![0x1b];
        out.extend_from_slice(&base);
        out
    } else {
        base
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forwards_left_click_inside_canvas() {
        let events = translate_canvas_mouse_event(
            Rect::new(10, 5, 40, 12),
            MouseEvent {
                kind: MouseEventKind::Down(MouseButton::Left),
                column: 13,
                row: 9,
                modifiers: KeyModifiers::empty(),
            },
            false,
        )
        .expect("mouse event should map into canvas");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].button, Some(VtMouseButton::Left));
        assert_eq!(events[0].action, VtMouseAction::Press);
        assert_eq!(events[0].x, 3);
        assert_eq!(events[0].y, 4);
    }

    #[test]
    fn ignores_mouse_outside_canvas() {
        let events = translate_canvas_mouse_event(
            Rect::new(10, 5, 40, 12),
            MouseEvent {
                kind: MouseEventKind::Down(MouseButton::Left),
                column: 9,
                row: 9,
                modifiers: KeyModifiers::empty(),
            },
            false,
        );

        assert!(events.is_none());
    }

    #[test]
    fn forwards_scroll_as_wheel_press_and_release() {
        let events = translate_canvas_mouse_event(
            Rect::new(10, 5, 40, 12),
            MouseEvent {
                kind: MouseEventKind::ScrollUp,
                column: 10,
                row: 5,
                modifiers: KeyModifiers::SHIFT,
            },
            false,
        )
        .expect("scroll event should map into canvas");

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].button, Some(VtMouseButton::WheelUp));
        assert_eq!(events[0].action, VtMouseAction::Press);
        assert_eq!(events[1].action, VtMouseAction::Release);
        assert!(events[0].shift);
    }
}
