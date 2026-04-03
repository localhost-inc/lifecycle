# libghostty-vt

Rust bindings for Ghostty's VT (virtual terminal) parser. This crate handles all terminal escape sequence parsing, screen state management, cursor tracking, and style resolution. The Lifecycle TUI uses it as the default VT backend (`vt-ghostty` feature).

## Dependency

Git dependency from `Cargo.toml`:

```toml
libghostty-vt = { git = "https://github.com/Uzaaft/libghostty-rs.git", optional = true }
```

The repository contains two crates:

- `libghostty-vt` -- safe, idiomatic Rust API
- `libghostty-vt-sys` -- raw FFI bindings (re-exported as `libghostty_vt::ffi`)

The sys crate fetches Ghostty source at build time, compiles it with Zig, and produces a dynamic library (`libghostty-vt.dylib`).

## Terminal

Create a terminal, feed it bytes, resize it:

```rust
use libghostty_vt::{Terminal, TerminalOptions};

let mut term = Terminal::new(TerminalOptions {
    cols: 80,
    rows: 24,
    max_scrollback: 10_000,
}).unwrap();

// Feed raw PTY output (VT-encoded bytes) into the parser.
// Never fails -- malformed input is silently consumed.
term.vt_write(b"Hello, \x1b[1;32mworld\x1b[0m!\r\n");

// Resize to new dimensions. cell_width/cell_height are in pixels
// (used for image protocols and size reports). For text-only TUI
// renderers, pass 1,1.
term.resize(120, 40, 1, 1).unwrap();
```

### Lifetime parameters

`Terminal<'alloc, 'cb>` has two lifetime parameters:

- `'alloc` -- custom allocator lifetime (use `'static` when not using one)
- `'cb` -- callback/effect lifetime

Our code uses `Terminal<'static, 'static>` since we don't use a custom allocator or register any effects.

### Effects (callbacks)

Effects are optional closures registered on the terminal for responding to VT queries during `vt_write`. Our TUI does not register any effects. If you need the terminal to respond to programs that probe capabilities (vim, tmux, htop), register at minimum:

```rust
terminal
    .on_pty_write(|_term, data| { /* write data back to PTY */ })?
    .on_device_attributes(|_term| { Some(device_attrs) })?;
```

See the ghostling_rs example in the libghostty-rs repo for a complete effects setup.

### Useful Terminal queries

```rust
term.cols()?;            // u16
term.rows()?;            // u16
term.cursor_x()?;        // u16
term.cursor_y()?;        // u16
term.title()?;           // &str (set by OSC 2)
term.pwd()?;             // &str (set by OSC 7)
term.total_rows()?;      // usize (viewport + scrollback)
term.scrollback_rows()?; // usize
```

## Render Pipeline

The render state API is the high-performance path for reading terminal screen contents. It captures a snapshot from the terminal, then exposes rows and cells via stateful iterators.

### Lifecycle

1. Create once, reuse across frames:
   ```rust
   let mut rs = RenderState::new().unwrap();
   let mut row_it = RowIterator::new().unwrap();
   let mut cell_it = CellIterator::new().unwrap();
   ```

2. Each frame, update from the terminal to get a snapshot:
   ```rust
   let snap = rs.update(&term).unwrap();
   ```

3. Iterate rows, then cells within each row:
   ```rust
   let mut row_iter = row_it.update(&snap).unwrap();
   while let Some(row) = row_iter.next() {
       let mut cell_iter = cell_it.update(&row).unwrap();
       while let Some(cell) = cell_iter.next() {
           let graphemes = cell.graphemes()?;     // Vec<char>
           let fg = cell.fg_color()?;             // Option<RgbColor>
           let bg = cell.bg_color()?;             // Option<RgbColor>
           let style = cell.style()?;             // Style
       }
       row.set_dirty(false)?;
   }
   snap.set_dirty(Dirty::Clean)?;
   ```

### Dirty tracking

Two independent layers:

- **Global**: `snap.dirty()` returns `Dirty::Clean | Dirty::Partial | Dirty::Full`
- **Per-row**: `row.dirty()` returns `bool`

The caller must clear both after rendering. Setting one does not clear the other.

### Colors

```rust
let colors = snap.colors()?;
// colors.background: RgbColor  -- terminal default bg
// colors.foreground: RgbColor  -- terminal default fg
// colors.cursor: Option<RgbColor>
// colors.palette: [RgbColor; 256]
```

Cell color methods (`fg_color()`, `bg_color()`) resolve palette indices automatically. They return `None` when the cell has no explicit color -- use `colors.foreground` / `colors.background` as fallback.

### Snapshot dimensions

```rust
snap.cols()?;  // u16
snap.rows()?;  // u16
```

## Cursor

```rust
// Visibility
let visible = snap.cursor_visible()?; // bool

// Position (only meaningful when visible and in viewport)
if let Some(vp) = snap.cursor_viewport()? {
    // vp.x: u16          -- column
    // vp.y: u16          -- row
    // vp.at_wide_tail: bool -- on trailing cell of a wide char
}

// Visual style
let style = snap.cursor_visual_style()?;
// CursorVisualStyle::Bar | Block | Underline | BlockHollow

// Blinking
let blinking = snap.cursor_blinking()?; // bool
```

## Style Types

### Style

```rust
pub struct Style {
    pub fg_color: StyleColor,
    pub bg_color: StyleColor,
    pub underline_color: StyleColor,
    pub bold: bool,
    pub italic: bool,
    pub faint: bool,
    pub blink: bool,
    pub inverse: bool,
    pub invisible: bool,
    pub strikethrough: bool,
    pub overline: bool,
    pub underline: Underline,
}
```

When reading via the render pipeline (`cell.style()`), color resolution is handled separately by `cell.fg_color()` and `cell.bg_color()`. The `fg_color` / `bg_color` / `underline_color` fields on `Style` are the raw style-level colors before palette resolution.

### Underline

```rust
pub enum Underline {
    None,
    Single,
    Double,
    Curly,
    Dotted,
    Dashed,
}
```

### RgbColor

```rust
pub struct RgbColor { pub r: u8, pub g: u8, pub b: u8 }
```

### StyleColor

```rust
pub enum StyleColor {
    None,
    Palette(PaletteIndex),
    Rgb(RgbColor),
}
```

## Threading Constraint

All libghostty-vt types are `!Send + !Sync`. They must live on a single thread.

Our architecture in the TUI:

```
reader thread           main thread
  |                       |
  | (reads PTY bytes)     |
  |------- mpsc --------->| term.vt_write(bytes)
  |        channel        | snap = rs.update(&term)
  |                       | (render from snap)
```

The `Terminal`, `RenderState`, `RowIterator`, and `CellIterator` all live on the main thread. Only raw `Vec<u8>` crosses the thread boundary via an `mpsc` channel.

## Input Encoding

The crate provides `key::Encoder` and `mouse::Encoder` for converting key/mouse events into terminal escape sequences. These handle legacy encoding, Kitty keyboard protocol, and various mouse protocols (X10, SGR, etc.).

We do not use these yet -- the TUI encodes keys manually. If you adopt them:

```rust
use libghostty_vt::key::{self, Key, Action, Mods};

let mut encoder = key::Encoder::new()?;
let mut event = key::Event::new()?;

// Sync encoder options from terminal state (cursor key mode, kitty flags, etc.)
encoder.set_options_from_terminal(&term);

// Encode a key press
event
    .set_action(Action::Press)
    .set_key(Key::Enter)
    .set_mods(Mods::empty());

let mut buf = Vec::with_capacity(32);
encoder.encode_to_vec(&event, &mut buf)?;
// buf now contains the escape sequence to write to PTY
```

Mouse encoding follows the same pattern with `mouse::Encoder`, `mouse::Event`, `mouse::Action`, and `mouse::Button`.

## Build Requirements

### Zig

The sys crate compiles Ghostty source using Zig. You need **Zig 0.15.x** on PATH.

```sh
# macOS
brew install zig
# or via zigup
zigup 0.15.0
```

### rpath workaround (macOS)

The sys crate links a dynamic library (`libghostty-vt.dylib`) but does not set an rpath. Our `apps/tui/build.rs` fixes this:

1. Adds `-Wl,-headerpad_max_install_names` so `install_name_tool` can work post-build
2. Finds the sys crate's build output directory containing `ghostty-install/lib`
3. Adds `-Wl,-rpath,<that directory>` so the binary can find the dylib at runtime

If the binary fails at launch with `dyld: Library not loaded: libghostty-vt.dylib`, the rpath was not set correctly. Check `apps/tui/build.rs` and ensure the sys crate built successfully.

### Feature flags

The ghostty backend is feature-gated in `apps/tui/Cargo.toml`:

```toml
[features]
default = ["vt-ghostty"]
vt-ghostty = ["dep:libghostty-vt"]
vt-vt100 = ["dep:vt100"]       # fallback backend
```

Build with `--no-default-features --features vt-vt100` to skip the Zig/Ghostty build entirely and use the pure-Rust vt100 fallback.

## Our Usage

The TUI backend lives at `apps/tui/src/vt/ghostty.rs`. It implements the `VtBackend` trait:

```rust
pub trait VtBackend {
    fn new(rows: u16, cols: u16) -> Self;
    fn process(&mut self, bytes: &[u8]);  // calls term.vt_write()
    fn resize(&mut self, rows: u16, cols: u16);
    fn snapshot(&self) -> VtGrid;         // render pipeline -> VtGrid
}
```

Key implementation details:

- `snapshot()` creates a fresh `RenderState`, `RowIterator`, and `CellIterator` each call. This is correct but not optimal -- for higher frame rates, cache and reuse these across calls.
- `resize()` passes `cell_width=1, cell_height=1` since we don't need pixel dimensions for text rendering.
- Graphemes are collapsed to the first `char` in the cluster. Multi-codepoint graphemes (e.g., emoji with ZWJ) will lose combining characters.
- No effects are registered, so programs that query terminal capabilities will not receive responses.

## Key Files

- `apps/tui/src/vt/ghostty.rs` -- our backend implementation
- `apps/tui/src/vt/mod.rs` -- VtBackend trait, VtCell, VtGrid types
- `apps/tui/build.rs` -- rpath workaround for macOS
- `apps/tui/Cargo.toml` -- feature flags and git dependency
