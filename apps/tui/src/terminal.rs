use std::io::{Read as IoRead, Write as IoWrite};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};

use crate::shell::ShellLaunchSpec;
use crate::vt::{VtBackend, VtGrid};

/// Manages a PTY session. The VT backend lives on the main thread.
/// A reader thread sends raw bytes via a channel.
pub struct PtySession<B: VtBackend> {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn IoWrite + Send>,
    backend: B,
    byte_rx: mpsc::Receiver<Vec<u8>>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
}

impl<B: VtBackend> PtySession<B> {
    pub fn spawn(rows: u16, cols: u16, launch: &ShellLaunchSpec) -> anyhow::Result<Self> {
        let pty_system = native_pty_system();
        let pair = pty_system.openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let mut cmd = CommandBuilder::new(&launch.program);
        cmd.args(&launch.args);
        cmd.env("TERM", "xterm-256color");
        if let Some(cwd) = &launch.cwd {
            cmd.cwd(cwd);
        }
        for (key, value) in &launch.env {
            cmd.env(key, value);
        }

        let child = pair.slave.spawn_command(cmd)?;
        drop(pair.slave);

        let writer = pair.master.take_writer()?;
        let mut reader = pair.master.try_clone_reader()?;

        let (byte_tx, byte_rx) = mpsc::channel::<Vec<u8>>();

        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if byte_tx.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                }
            }
        });

        let backend = B::new(rows, cols);

        Ok(Self {
            master: pair.master,
            writer,
            backend,
            byte_rx,
            _child: child,
        })
    }

    /// Drain pending bytes from the reader thread into the VT backend.
    /// Uses a time budget (8ms) so heavy output doesn't block rendering.
    /// Also intercepts terminal queries and writes responses back to the PTY.
    /// Returns `(alive, had_data, shell_activity)`.
    pub fn process_pending(&mut self) -> (bool, bool, Option<ShellActivity>) {
        let deadline = Instant::now() + Duration::from_millis(8);
        let mut count = 0u32;
        let mut had_data = false;
        let mut activity: Option<ShellActivity> = None;
        loop {
            match self.byte_rx.try_recv() {
                Ok(bytes) => {
                    had_data = true;
                    let responses = scan_terminal_queries(&bytes);
                    if !responses.is_empty() {
                        let _ = self.writer.write_all(&responses);
                        let _ = self.writer.flush();
                    }
                    if let Some(a) = scan_shell_activity(&bytes) {
                        activity = Some(a);
                    }
                    self.backend.process(&bytes);
                }
                Err(mpsc::TryRecvError::Empty) => break,
                Err(mpsc::TryRecvError::Disconnected) => return (false, had_data, activity),
            }
            count += 1;
            if count % 64 == 0 && Instant::now() >= deadline {
                break;
            }
        }
        (true, had_data, activity)
    }

    pub fn write(&mut self, bytes: &[u8]) -> anyhow::Result<()> {
        self.writer.write_all(bytes)?;
        Ok(())
    }

    /// Resize both the PTY and the VT backend so the shell sees the correct dimensions.
    pub fn resize(&mut self, rows: u16, cols: u16) {
        let _ = self.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        });
        self.backend.resize(rows, cols);
    }

    pub fn is_dirty(&mut self) -> bool {
        self.backend.is_dirty()
    }

    pub fn snapshot(&mut self) -> VtGrid {
        self.backend.snapshot()
    }
}

/// Shell activity state changes detected from OSC 133 sequences.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellActivity {
    /// OSC 133;B — user executed a command.
    CommandStarted,
    /// OSC 133;D — command finished, prompt returned.
    CommandFinished,
}

/// Scan raw PTY output for OSC 133 shell integration sequences.
/// Returns any activity transitions found in this chunk.
pub fn scan_shell_activity(bytes: &[u8]) -> Option<ShellActivity> {
    let mut last: Option<ShellActivity> = None;
    let len = bytes.len();
    let mut i = 0;

    // OSC = ESC ] ... BEL  or  ESC ] ... ESC backslash
    while i < len {
        // Look for ESC ]
        if bytes[i] != 0x1b || i + 1 >= len || bytes[i + 1] != b']' {
            i += 1;
            continue;
        }

        let payload_start = i + 2;
        // Find the terminator: BEL (0x07) or ST (ESC \)
        let mut j = payload_start;
        while j < len {
            if bytes[j] == 0x07 {
                break;
            }
            if bytes[j] == 0x1b && j + 1 < len && bytes[j + 1] == b'\\' {
                break;
            }
            j += 1;
        }
        if j >= len {
            // Incomplete OSC at end of chunk — skip.
            break;
        }

        let payload = &bytes[payload_start..j];
        // We care about "133;B" (command start) and "133;D" (command end).
        if payload.starts_with(b"133;B") {
            last = Some(ShellActivity::CommandStarted);
        } else if payload.starts_with(b"133;D") {
            last = Some(ShellActivity::CommandFinished);
        }

        // Advance past terminator.
        i = if bytes[j] == 0x07 { j + 1 } else { j + 2 };
    }

    last
}

/// Scan raw PTY output for terminal query sequences that expect a response.
/// Programs like fzf, vim, etc. send these at startup and block until they
/// get an answer — without responses they hang for a timeout.
fn scan_terminal_queries(bytes: &[u8]) -> Vec<u8> {
    let mut responses = Vec::new();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        if bytes[i] != 0x1b || i + 2 >= len || bytes[i + 1] != b'[' {
            i += 1;
            continue;
        }

        // We have ESC [ — find the final byte (letter) of the CSI sequence.
        let param_start = i + 2;
        let mut j = param_start;
        while j < len && (bytes[j] < 0x40 || bytes[j] > 0x7e) {
            j += 1;
        }
        if j >= len {
            break; // incomplete sequence at end of chunk, skip
        }

        let params = &bytes[param_start..j];
        let final_byte = bytes[j];

        match final_byte {
            // DA1: \e[c  or  \e[0c
            // DA2: \e[>c or  \e[>0c
            b'c' => {
                if params.is_empty() || params == b"0" {
                    // Primary Device Attributes — claim VT220 + ANSI color
                    responses.extend_from_slice(b"\x1b[?62;22c");
                } else if params == b">" || params == b">0" {
                    // Secondary Device Attributes
                    responses.extend_from_slice(b"\x1b[>1;1;0c");
                }
            }
            // DSR: \e[6n (cursor position report)
            b'n' if params == b"6" => {
                responses.extend_from_slice(b"\x1b[1;1R");
            }
            _ => {}
        }

        i = j + 1;
    }

    responses
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_command_started() {
        // OSC 133;B terminated with BEL
        let bytes = b"\x1b]133;B\x07";
        assert_eq!(scan_shell_activity(bytes), Some(ShellActivity::CommandStarted));
    }

    #[test]
    fn detects_command_finished() {
        // OSC 133;D terminated with BEL
        let bytes = b"\x1b]133;D\x07";
        assert_eq!(scan_shell_activity(bytes), Some(ShellActivity::CommandFinished));
    }

    #[test]
    fn detects_command_finished_with_exit_code() {
        // OSC 133;D;0 — includes exit code
        let bytes = b"\x1b]133;D;0\x07";
        assert_eq!(scan_shell_activity(bytes), Some(ShellActivity::CommandFinished));
    }

    #[test]
    fn detects_st_terminator() {
        // OSC 133;B terminated with ESC backslash (ST)
        let bytes = b"\x1b]133;B\x1b\\";
        assert_eq!(scan_shell_activity(bytes), Some(ShellActivity::CommandStarted));
    }

    #[test]
    fn last_event_wins_in_chunk() {
        // A prompt sequence: D then A then B — last is B (command started)
        let bytes = b"\x1b]133;D\x07\x1b]133;A\x07\x1b]133;B\x07";
        assert_eq!(scan_shell_activity(bytes), Some(ShellActivity::CommandStarted));
    }

    #[test]
    fn prompt_sequence_returns_finished() {
        // Typical PROMPT_COMMAND output: D then A — last is A (prompt), but we
        // only track B and D, so the last recognized event is D.
        let bytes = b"\x1b]133;D\x07\x1b]133;A\x07";
        assert_eq!(scan_shell_activity(bytes), Some(ShellActivity::CommandFinished));
    }

    #[test]
    fn ignores_unrelated_osc() {
        let bytes = b"\x1b]0;window title\x07hello";
        assert_eq!(scan_shell_activity(bytes), None);
    }

    #[test]
    fn no_osc_returns_none() {
        let bytes = b"just some regular output\r\n";
        assert_eq!(scan_shell_activity(bytes), None);
    }

    #[test]
    fn mixed_with_regular_output() {
        let bytes = b"building...\x1b]133;B\x07cargo build\r\n";
        assert_eq!(scan_shell_activity(bytes), Some(ShellActivity::CommandStarted));
    }
}
