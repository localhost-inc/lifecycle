use ratatui::style::Color;

#[cfg(feature = "vt-ghostty")]
pub mod ghostty;

#[cfg(feature = "vt-vt100")]
pub mod fallback;

/// A single cell in the terminal grid.
#[derive(Clone, Debug)]
pub struct VtCell {
    pub ch: char,
    pub fg: Option<Color>,
    pub bg: Option<Color>,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub inverse: bool,
}

impl Default for VtCell {
    fn default() -> Self {
        Self {
            ch: ' ',
            fg: None,
            bg: None,
            bold: false,
            italic: false,
            underline: false,
            inverse: false,
        }
    }
}

/// Snapshot of the terminal grid state.
#[derive(Clone, Debug)]
pub struct VtGrid {
    pub rows: u16,
    pub cols: u16,
    pub cursor_row: u16,
    pub cursor_col: u16,
    pub cursor_visible: bool,
    pub cells: Vec<Vec<VtCell>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VtMouseAction {
    Press,
    Release,
    Motion,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VtMouseButton {
    Left,
    Right,
    Middle,
    WheelUp,
    WheelDown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct VtMouseEvent {
    pub action: VtMouseAction,
    pub button: Option<VtMouseButton>,
    pub x: u16,
    pub y: u16,
    pub shift: bool,
    pub alt: bool,
    pub control: bool,
}

/// Trait abstracting the VT sequence parser + terminal state.
/// NOT required to be Send — libghostty is !Send + !Sync, so the backend
/// lives on the main thread. Raw bytes arrive via a channel from the reader thread.
pub trait VtBackend {
    fn new(rows: u16, cols: u16) -> Self
    where
        Self: Sized;

    fn process(&mut self, bytes: &[u8]);
    fn resize(&mut self, rows: u16, cols: u16);

    /// Returns true if the terminal state changed since the last snapshot.
    fn is_dirty(&mut self) -> bool;

    /// Build a snapshot of the current terminal grid.
    /// Implementations should leverage dirty tracking to skip unchanged rows.
    fn snapshot(&mut self) -> VtGrid;

    /// Encode a mouse event using the backend's current terminal mode state.
    fn encode_mouse(&mut self, _event: &VtMouseEvent) -> Vec<u8> {
        Vec::new()
    }
}

#[cfg(feature = "vt-ghostty")]
pub type ActiveBackend = ghostty::GhosttyBackend;

#[cfg(all(feature = "vt-vt100", not(feature = "vt-ghostty")))]
pub type ActiveBackend = fallback::Vt100Backend;
