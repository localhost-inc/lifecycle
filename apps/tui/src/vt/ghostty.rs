use crossterm::event::{
    KeyCode as CrosstermKeyCode, KeyEvent as CrosstermKeyEvent, KeyEventKind, KeyEventState,
    KeyModifiers as CrosstermKeyModifiers, MediaKeyCode, ModifierKeyCode,
};
use ratatui::style::Color;

use libghostty_vt::key::{Action as KeyAction, Encoder as KeyEncoder, Event as KeyEvent, Key, Mods};
use libghostty_vt::mouse::{
    self, Action as MouseAction, Button as MouseButton, Encoder as MouseEncoder,
    EncoderSize, Event as MouseEvent,
};
use libghostty_vt::render::{CellIterator, Dirty, RenderState, RowIterator};
use libghostty_vt::{Terminal, TerminalOptions};

use super::{VtBackend, VtCell, VtGrid, VtMouseAction, VtMouseButton, VtMouseEvent};

pub struct GhosttyBackend {
    term: Terminal<'static, 'static>,
    render_state: RenderState<'static>,
    row_iter: RowIterator<'static>,
    cell_iter: CellIterator<'static>,
    key_encoder: KeyEncoder<'static>,
    key_event: KeyEvent<'static>,
    mouse_encoder: MouseEncoder<'static>,
    mouse_event: MouseEvent<'static>,
    mouse_button_down: bool,
    rows: u16,
    cols: u16,
    /// Persistent grid storage — reused across frames.
    cached: VtGrid,
}

impl VtBackend for GhosttyBackend {
    fn new(rows: u16, cols: u16) -> Self {
        crate::debug::log(format!("ghostty backend new rows={rows} cols={cols}"));
        let term = Terminal::new(TerminalOptions {
            cols,
            rows,
            max_scrollback: 10_000,
        })
        .expect("failed to create ghostty terminal");

        let render_state = RenderState::new().expect("failed to create render state");
        let row_iter = RowIterator::new().expect("failed to create row iterator");
        let cell_iter = CellIterator::new().expect("failed to create cell iterator");
        let key_encoder = KeyEncoder::new().expect("failed to create key encoder");
        let key_event = KeyEvent::new().expect("failed to create key event");
        let mouse_encoder = MouseEncoder::new().expect("failed to create mouse encoder");
        let mouse_event = MouseEvent::new().expect("failed to create mouse event");

        let cached = alloc_grid(rows, cols);

        Self {
            term,
            render_state,
            row_iter,
            cell_iter,
            key_encoder,
            key_event,
            mouse_encoder,
            mouse_event,
            mouse_button_down: false,
            rows,
            cols,
            cached,
        }
    }

    fn process(&mut self, bytes: &[u8]) {
        self.term.vt_write(bytes);
    }

    fn resize(&mut self, rows: u16, cols: u16) {
        crate::debug::log(format!("ghostty resize rows={rows} cols={cols}"));
        self.rows = rows;
        self.cols = cols;
        let _ = self.term.resize(cols, rows, 1, 1);
        // Reallocate grid when dimensions change.
        ensure_grid_size(&mut self.cached, rows, cols);
    }

    fn is_dirty(&mut self) -> bool {
        let snap = match self.render_state.update(&self.term) {
            Ok(s) => s,
            Err(_) => return true, // assume dirty on error
        };
        match snap.dirty() {
            Ok(Dirty::Clean) => false,
            _ => true,
        }
    }

    fn snapshot(&mut self) -> VtGrid {
        let snap = match self.render_state.update(&self.term) {
            Ok(s) => s,
            Err(_) => return self.cached.clone(),
        };

        // Read cursor state.
        let cursor_visible = snap.cursor_visible().unwrap_or(false);
        let (cursor_col, cursor_row) = snap
            .cursor_viewport()
            .ok()
            .flatten()
            .map(|c| (c.x, c.y))
            .unwrap_or((0, 0));

        self.cached.cursor_row = cursor_row;
        self.cached.cursor_col = cursor_col;
        self.cached.cursor_visible = cursor_visible;

        // Ensure grid dimensions match.
        ensure_grid_size(&mut self.cached, self.rows, self.cols);

        let dirty_level = snap.dirty().unwrap_or(Dirty::Full);
        let full_redraw = matches!(dirty_level, Dirty::Full);

        // Reusable stack buffer for grapheme codepoints.
        let mut gbuf = ['\0'; 8];

        let mut row_iter = match self.row_iter.update(&snap) {
            Ok(r) => r,
            Err(_) => {
                let _ = snap.set_dirty(Dirty::Clean);
                return self.cached.clone();
            }
        };

        let mut row_idx = 0usize;
        while let Some(row) = row_iter.next() {
            let row_dirty = row.dirty().unwrap_or(true);

            // Skip clean rows unless a full redraw is needed.
            if !full_redraw && !row_dirty {
                row_idx += 1;
                continue;
            }

            if let Some(cells_row) = self.cached.cells.get_mut(row_idx) {
                let mut cell_iter = match self.cell_iter.update(&row) {
                    Ok(c) => c,
                    Err(_) => break,
                };

                let mut col_idx = 0usize;
                while let Some(cell) = cell_iter.next() {
                    if col_idx >= cells_row.len() {
                        break;
                    }

                    let len = cell.graphemes_len().unwrap_or(0);
                    let ch = if len == 0 {
                        ' '
                    } else {
                        let buf_len = len.min(gbuf.len());
                        if cell.graphemes_buf(&mut gbuf[..buf_len]).is_ok() {
                            gbuf[0]
                        } else {
                            ' '
                        }
                    };

                    let fg = cell
                        .fg_color()
                        .ok()
                        .flatten()
                        .map(|c| Color::Rgb(c.r, c.g, c.b));
                    let bg = cell
                        .bg_color()
                        .ok()
                        .flatten()
                        .map(|c| Color::Rgb(c.r, c.g, c.b));

                    let style = cell.style().ok();
                    let bold = style.as_ref().map_or(false, |s| s.bold);
                    let italic = style.as_ref().map_or(false, |s| s.italic);
                    let inverse = style.as_ref().map_or(false, |s| s.inverse);
                    let underline = style.as_ref().map_or(false, |s| {
                        !matches!(s.underline, libghostty_vt::style::Underline::None)
                    });

                    let target = &mut cells_row[col_idx];
                    target.ch = ch;
                    target.fg = fg;
                    target.bg = bg;
                    target.bold = bold;
                    target.italic = italic;
                    target.underline = underline;
                    target.inverse = inverse;

                    col_idx += 1;
                }
            }

            // Clear per-row dirty flag.
            let _ = row.set_dirty(false);
            row_idx += 1;
        }

        // Clear global dirty state.
        let _ = snap.set_dirty(Dirty::Clean);

        self.cached.clone()
    }

    fn encode_key(&mut self, key: CrosstermKeyEvent) -> Vec<u8> {
        crate::debug::log(format!("ghostty encode_key input: {:?}", key));
        let Some(mapped) = map_crossterm_key_event(key) else {
            crate::debug::log("ghostty encode_key unmapped");
            return Vec::new();
        };

        self.key_event
            .set_action(mapped.action)
            .set_key(mapped.key)
            .set_mods(mapped.mods)
            .set_consumed_mods(mapped.consumed_mods)
            .set_composing(false)
            .set_utf8(mapped.utf8.as_deref())
            .set_unshifted_codepoint(mapped.unshifted_codepoint);

        let mut bytes = Vec::new();
        if self
            .key_encoder
            .set_options_from_terminal(&self.term)
            .encode_to_vec(&self.key_event, &mut bytes)
            .is_err()
        {
            crate::debug::log("ghostty encode_key error");
            return Vec::new();
        }

        crate::debug::log(format!("ghostty encode_key output {} bytes", bytes.len()));
        bytes
    }

    fn encode_mouse(&mut self, event: &VtMouseEvent) -> Vec<u8> {
        crate::debug::log(format!("ghostty encode_mouse input: {:?}", event));
        let is_tracking = self.term.is_mouse_tracking().unwrap_or(false);
        let should_emit = matches!(
            event.button,
            Some(
                VtMouseButton::Left
                    | VtMouseButton::Right
                    | VtMouseButton::Middle
                    | VtMouseButton::WheelUp
                    | VtMouseButton::WheelDown
            )
        ) && is_tracking;

        if !should_emit {
            crate::debug::log(format!("ghostty encode_mouse skipped tracking={is_tracking}"));
            return Vec::new();
        }

        let mut mods = Mods::empty();
        if event.shift {
            mods |= Mods::SHIFT;
        }
        if event.alt {
            mods |= Mods::ALT;
        }
        if event.control {
            mods |= Mods::CTRL;
        }

        let any_button_pressed = match (event.action, event.button) {
            (VtMouseAction::Press, Some(VtMouseButton::Left | VtMouseButton::Right | VtMouseButton::Middle)) => true,
            (VtMouseAction::Release, Some(VtMouseButton::Left | VtMouseButton::Right | VtMouseButton::Middle)) => false,
            _ => self.mouse_button_down,
        };

        self.mouse_encoder
            .set_options_from_terminal(&self.term)
            .set_size(EncoderSize {
                screen_width: self.cols as u32,
                screen_height: self.rows as u32,
                cell_width: 1,
                cell_height: 1,
                padding_top: 0,
                padding_bottom: 0,
                padding_left: 0,
                padding_right: 0,
            })
            .set_any_button_pressed(any_button_pressed)
            .set_track_last_cell(true);

        self.mouse_event
            .set_mods(mods)
            .set_action(match event.action {
                VtMouseAction::Press => MouseAction::Press,
                VtMouseAction::Release => MouseAction::Release,
                VtMouseAction::Motion => MouseAction::Motion,
            })
            .set_button(event.button.map(map_mouse_button))
            .set_position(mouse::Position {
                x: event.x as f32,
                y: event.y as f32,
            });

        let mut bytes = Vec::new();
        if self
            .mouse_encoder
            .encode_to_vec(&self.mouse_event, &mut bytes)
            .is_err()
        {
            crate::debug::log("ghostty encode_mouse error");
            return Vec::new();
        }

        self.mouse_button_down = any_button_pressed;
        crate::debug::log(format!("ghostty encode_mouse output {} bytes", bytes.len()));
        bytes
    }
}

fn map_mouse_button(button: VtMouseButton) -> MouseButton {
    match button {
        VtMouseButton::Left => MouseButton::Left,
        VtMouseButton::Right => MouseButton::Right,
        VtMouseButton::Middle => MouseButton::Middle,
        VtMouseButton::WheelUp => MouseButton::Four,
        VtMouseButton::WheelDown => MouseButton::Five,
    }
}

struct MappedKeyEvent {
    action: KeyAction,
    key: Key,
    mods: Mods,
    consumed_mods: Mods,
    utf8: Option<String>,
    unshifted_codepoint: char,
}

fn map_crossterm_key_event(key: CrosstermKeyEvent) -> Option<MappedKeyEvent> {
    let mut mods = Mods::empty();
    if key.modifiers.contains(CrosstermKeyModifiers::SHIFT) {
        mods |= Mods::SHIFT;
    }
    if key.modifiers.contains(CrosstermKeyModifiers::ALT) {
        mods |= Mods::ALT;
    }
    if key.modifiers.contains(CrosstermKeyModifiers::CONTROL) {
        mods |= Mods::CTRL;
    }
    if key.modifiers.contains(CrosstermKeyModifiers::SUPER) {
        mods |= Mods::SUPER;
    }
    if key.state.contains(KeyEventState::CAPS_LOCK) {
        mods |= Mods::CAPS_LOCK;
    }
    if key.state.contains(KeyEventState::NUM_LOCK) {
        mods |= Mods::NUM_LOCK;
    }

    let action = match key.kind {
        KeyEventKind::Press => KeyAction::Press,
        KeyEventKind::Repeat => KeyAction::Repeat,
        KeyEventKind::Release => KeyAction::Release,
    };

    let mut consumed_mods = Mods::empty();
    let mut utf8 = None;

    let (mapped_key, unshifted_codepoint) = match key.code {
        CrosstermKeyCode::Backspace => (Key::Backspace, '\0'),
        CrosstermKeyCode::Enter => (Key::Enter, '\0'),
        CrosstermKeyCode::Left => (Key::ArrowLeft, '\0'),
        CrosstermKeyCode::Right => (Key::ArrowRight, '\0'),
        CrosstermKeyCode::Up => (Key::ArrowUp, '\0'),
        CrosstermKeyCode::Down => (Key::ArrowDown, '\0'),
        CrosstermKeyCode::Home => (Key::Home, '\0'),
        CrosstermKeyCode::End => (Key::End, '\0'),
        CrosstermKeyCode::PageUp => (Key::PageUp, '\0'),
        CrosstermKeyCode::PageDown => (Key::PageDown, '\0'),
        CrosstermKeyCode::Tab => (Key::Tab, '\0'),
        CrosstermKeyCode::BackTab => {
            mods |= Mods::SHIFT;
            (Key::Tab, '\0')
        }
        CrosstermKeyCode::Delete => (Key::Delete, '\0'),
        CrosstermKeyCode::Insert => (Key::Insert, '\0'),
        CrosstermKeyCode::F(n) => (map_function_key(n)?, '\0'),
        CrosstermKeyCode::Char(c) => {
            let (mapped_key, unshifted) = map_char_key(c)?;
            if !matches!(action, KeyAction::Release)
                && !mods.intersects(Mods::CTRL | Mods::SUPER)
            {
                utf8 = Some(c.to_string());
                if mods.contains(Mods::SHIFT) {
                    consumed_mods |= Mods::SHIFT;
                }
            }
            (mapped_key, unshifted)
        }
        CrosstermKeyCode::Null => return None,
        CrosstermKeyCode::Esc => (Key::Escape, '\0'),
        CrosstermKeyCode::CapsLock => (Key::CapsLock, '\0'),
        CrosstermKeyCode::ScrollLock => (Key::ScrollLock, '\0'),
        CrosstermKeyCode::NumLock => (Key::NumLock, '\0'),
        CrosstermKeyCode::PrintScreen => (Key::PrintScreen, '\0'),
        CrosstermKeyCode::Pause => (Key::Pause, '\0'),
        CrosstermKeyCode::Menu => (Key::ContextMenu, '\0'),
        CrosstermKeyCode::KeypadBegin => (Key::NumpadBegin, '\0'),
        CrosstermKeyCode::Media(media) => (map_media_key(media)?, '\0'),
        CrosstermKeyCode::Modifier(modifier) => (map_modifier_key(modifier)?, '\0'),
    };

    Some(MappedKeyEvent {
        action,
        key: mapped_key,
        mods,
        consumed_mods,
        utf8,
        unshifted_codepoint,
    })
}

fn map_function_key(number: u8) -> Option<Key> {
    Some(match number {
        1 => Key::F1,
        2 => Key::F2,
        3 => Key::F3,
        4 => Key::F4,
        5 => Key::F5,
        6 => Key::F6,
        7 => Key::F7,
        8 => Key::F8,
        9 => Key::F9,
        10 => Key::F10,
        11 => Key::F11,
        12 => Key::F12,
        13 => Key::F13,
        14 => Key::F14,
        15 => Key::F15,
        16 => Key::F16,
        17 => Key::F17,
        18 => Key::F18,
        19 => Key::F19,
        20 => Key::F20,
        21 => Key::F21,
        22 => Key::F22,
        23 => Key::F23,
        24 => Key::F24,
        25 => Key::F25,
        _ => return None,
    })
}

fn map_media_key(key: MediaKeyCode) -> Option<Key> {
    Some(match key {
        MediaKeyCode::Play => Key::MediaPlayPause,
        MediaKeyCode::Pause => Key::Pause,
        MediaKeyCode::PlayPause => Key::MediaPlayPause,
        MediaKeyCode::Reverse => return None,
        MediaKeyCode::Stop => Key::MediaStop,
        MediaKeyCode::FastForward => return None,
        MediaKeyCode::Rewind => return None,
        MediaKeyCode::TrackNext => Key::MediaTrackNext,
        MediaKeyCode::TrackPrevious => Key::MediaTrackPrevious,
        MediaKeyCode::Record => return None,
        MediaKeyCode::LowerVolume => Key::AudioVolumeDown,
        MediaKeyCode::RaiseVolume => Key::AudioVolumeUp,
        MediaKeyCode::MuteVolume => Key::AudioVolumeMute,
    })
}

fn map_modifier_key(key: ModifierKeyCode) -> Option<Key> {
    Some(match key {
        ModifierKeyCode::LeftShift => Key::ShiftLeft,
        ModifierKeyCode::LeftControl => Key::ControlLeft,
        ModifierKeyCode::LeftAlt => Key::AltLeft,
        ModifierKeyCode::LeftSuper => Key::MetaLeft,
        ModifierKeyCode::LeftHyper => return None,
        ModifierKeyCode::LeftMeta => return None,
        ModifierKeyCode::RightShift => Key::ShiftRight,
        ModifierKeyCode::RightControl => Key::ControlRight,
        ModifierKeyCode::RightAlt => Key::AltRight,
        ModifierKeyCode::RightSuper => Key::MetaRight,
        ModifierKeyCode::RightHyper => return None,
        ModifierKeyCode::RightMeta => return None,
        ModifierKeyCode::IsoLevel3Shift => return None,
        ModifierKeyCode::IsoLevel5Shift => return None,
    })
}

fn map_char_key(c: char) -> Option<(Key, char)> {
    Some(match c {
        'a'..='z' => (map_alpha_key(c)?, c),
        'A'..='Z' => (map_alpha_key(c.to_ascii_lowercase())?, c.to_ascii_lowercase()),
        '0'..='9' => (map_digit_key(c)?, c),
        ' ' => (Key::Space, ' '),
        '-' | '_' => (Key::Minus, '-'),
        '=' | '+' => (Key::Equal, '='),
        '[' | '{' => (Key::BracketLeft, '['),
        ']' | '}' => (Key::BracketRight, ']'),
        '\\' | '|' => (Key::Backslash, '\\'),
        ';' | ':' => (Key::Semicolon, ';'),
        '\'' | '"' => (Key::Quote, '\''),
        ',' | '<' => (Key::Comma, ','),
        '.' | '>' => (Key::Period, '.'),
        '/' | '?' => (Key::Slash, '/'),
        '`' | '~' => (Key::Backquote, '`'),
        '!' => (Key::Digit1, '1'),
        '@' => (Key::Digit2, '2'),
        '#' => (Key::Digit3, '3'),
        '$' => (Key::Digit4, '4'),
        '%' => (Key::Digit5, '5'),
        '^' => (Key::Digit6, '6'),
        '&' => (Key::Digit7, '7'),
        '*' => (Key::Digit8, '8'),
        '(' => (Key::Digit9, '9'),
        ')' => (Key::Digit0, '0'),
        _ => return None,
    })
}

fn map_alpha_key(c: char) -> Option<Key> {
    Some(match c {
        'a' => Key::A,
        'b' => Key::B,
        'c' => Key::C,
        'd' => Key::D,
        'e' => Key::E,
        'f' => Key::F,
        'g' => Key::G,
        'h' => Key::H,
        'i' => Key::I,
        'j' => Key::J,
        'k' => Key::K,
        'l' => Key::L,
        'm' => Key::M,
        'n' => Key::N,
        'o' => Key::O,
        'p' => Key::P,
        'q' => Key::Q,
        'r' => Key::R,
        's' => Key::S,
        't' => Key::T,
        'u' => Key::U,
        'v' => Key::V,
        'w' => Key::W,
        'x' => Key::X,
        'y' => Key::Y,
        'z' => Key::Z,
        _ => return None,
    })
}

fn map_digit_key(c: char) -> Option<Key> {
    Some(match c {
        '0' => Key::Digit0,
        '1' => Key::Digit1,
        '2' => Key::Digit2,
        '3' => Key::Digit3,
        '4' => Key::Digit4,
        '5' => Key::Digit5,
        '6' => Key::Digit6,
        '7' => Key::Digit7,
        '8' => Key::Digit8,
        '9' => Key::Digit9,
        _ => return None,
    })
}

/// Allocate a grid with default (blank) cells.
fn alloc_grid(rows: u16, cols: u16) -> VtGrid {
    let cells = (0..rows)
        .map(|_| vec![VtCell::default(); cols as usize])
        .collect();
    VtGrid {
        rows,
        cols,
        cursor_row: 0,
        cursor_col: 0,
        cursor_visible: false,
        cells,
    }
}

/// Resize the cached grid in-place, preserving existing data where possible.
fn ensure_grid_size(grid: &mut VtGrid, rows: u16, cols: u16) {
    if grid.rows == rows && grid.cols == cols {
        return;
    }
    grid.rows = rows;
    grid.cols = cols;
    grid.cells
        .resize_with(rows as usize, || vec![VtCell::default(); cols as usize]);
    for row in &mut grid.cells {
        row.resize_with(cols as usize, VtCell::default);
    }
}
