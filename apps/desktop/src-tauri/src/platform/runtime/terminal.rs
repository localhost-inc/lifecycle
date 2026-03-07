use crate::shared::errors::{LifecycleError, TerminalFailureReason, TerminalStatus};
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

const REPLAY_LIMIT: usize = 400;
const READ_BUFFER_SIZE: usize = 4096;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct TerminalStreamChunk {
    pub cursor: String,
    pub data: String,
    pub kind: TerminalStreamChunkKind,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TerminalStreamChunkKind {
    Replay,
    Live,
}

#[derive(Debug, Clone)]
pub struct TerminalExitOutcome {
    pub exit_code: Option<i64>,
    pub failure_reason: Option<TerminalFailureReason>,
    pub status: TerminalStatus,
}

type ExitCallback = Arc<dyn Fn(TerminalExitOutcome) + Send + Sync + 'static>;

#[derive(Clone)]
pub struct TerminalSupervisor {
    inner: Arc<TerminalSupervisorInner>,
}

struct TerminalSupervisorInner {
    attachment: Mutex<Option<Channel<TerminalStreamChunk>>>,
    exited: Mutex<Option<TerminalExitOutcome>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    next_cursor: Mutex<u64>,
    replay: Mutex<VecDeque<ReplayChunk>>,
    writer: Mutex<Box<dyn Write + Send>>,
}

#[derive(Debug, Clone)]
struct ReplayChunk {
    cursor: u64,
    data: String,
}

impl TerminalSupervisor {
    pub fn spawn(
        command: CommandBuilder,
        cols: u16,
        rows: u16,
        treat_nonzero_as_failure: bool,
        on_exit: ExitCallback,
    ) -> Result<Self, LifecycleError> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| LifecycleError::LocalPtySpawnFailed(e.to_string()))?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| LifecycleError::LocalPtySpawnFailed(e.to_string()))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| LifecycleError::LocalPtySpawnFailed(e.to_string()))?;
        let mut child = pair
            .slave
            .spawn_command(command)
            .map_err(|e| LifecycleError::LocalPtySpawnFailed(e.to_string()))?;
        let killer = child.clone_killer();

        let inner = Arc::new(TerminalSupervisorInner {
            attachment: Mutex::new(None),
            exited: Mutex::new(None),
            killer: Mutex::new(killer),
            master: Mutex::new(pair.master),
            next_cursor: Mutex::new(0),
            replay: Mutex::new(VecDeque::with_capacity(REPLAY_LIMIT)),
            writer: Mutex::new(writer),
        });

        let read_inner = inner.clone();
        std::thread::spawn(move || {
            let mut buffer = vec![0_u8; READ_BUFFER_SIZE];
            let mut pending_utf8 = Vec::new();
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(read) => {
                        if let Some(data) = decode_terminal_output(&mut pending_utf8, &buffer[..read]) {
                            let chunk = read_inner.push_replay(data);
                            read_inner.send_live(chunk);
                        }
                    }
                    Err(error) => {
                        tracing::debug!("terminal reader closed: {error}");
                        break;
                    }
                }
            }

            if !pending_utf8.is_empty() {
                let data = String::from_utf8_lossy(&pending_utf8).to_string();
                if !data.is_empty() {
                    let chunk = read_inner.push_replay(data);
                    read_inner.send_live(chunk);
                }
            }
        });

        let wait_inner = inner.clone();
        std::thread::spawn(move || {
            let outcome = match child.wait() {
                Ok(exit_status) => {
                    let exit_code = i64::from(exit_status.exit_code());
                    if exit_status.success() || !treat_nonzero_as_failure {
                        TerminalExitOutcome {
                            exit_code: Some(exit_code),
                            failure_reason: None,
                            status: TerminalStatus::Finished,
                        }
                    } else {
                        TerminalExitOutcome {
                            exit_code: Some(exit_code),
                            failure_reason: Some(TerminalFailureReason::HarnessProcessExitNonzero),
                            status: TerminalStatus::Failed,
                        }
                    }
                }
                Err(_error) => TerminalExitOutcome {
                    exit_code: None,
                    failure_reason: Some(TerminalFailureReason::Unknown),
                    status: TerminalStatus::Failed,
                },
            };

            {
                let mut exited = wait_inner.exited.lock().unwrap();
                *exited = Some(outcome.clone());
            }

            {
                let mut attachment = wait_inner.attachment.lock().unwrap();
                *attachment = None;
            }

            on_exit(outcome);
        });

        Ok(Self { inner })
    }

    pub fn attach(
        &self,
        channel: Channel<TerminalStreamChunk>,
        replay_cursor: Option<&str>,
    ) -> Result<Option<String>, LifecycleError> {
        let mut attachment = self.inner.attachment.lock().unwrap();
        let replay_cursor = parse_replay_cursor(replay_cursor);
        let replay = self
            .inner
            .replay
            .lock()
            .unwrap()
            .iter()
            .cloned()
            .filter(|chunk| match replay_cursor {
                Some(cursor) => chunk.cursor > cursor,
                None => true,
            })
            .collect::<Vec<_>>();

        for chunk in replay {
            channel
                .send(TerminalStreamChunk {
                    cursor: chunk.cursor.to_string(),
                    data: chunk.data,
                    kind: TerminalStreamChunkKind::Replay,
                })
                .map_err(|e| LifecycleError::AttachFailed(e.to_string()))?;
        }

        if self.exit_outcome().is_none() {
            *attachment = Some(channel);
        }

        Ok(self.replay_cursor())
    }

    pub fn detach(&self) {
        let mut attachment = self.inner.attachment.lock().unwrap();
        *attachment = None;
    }

    pub fn write(&self, data: &str) -> Result<(), LifecycleError> {
        let mut writer = self.inner.writer.lock().unwrap();
        writer
            .write_all(data.as_bytes())
            .and_then(|_| writer.flush())
            .map_err(|e| LifecycleError::Io(e.to_string()))
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), LifecycleError> {
        let master = self.inner.master.lock().unwrap();
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| LifecycleError::Io(e.to_string()))
    }

    pub fn kill(&self) -> Result<(), LifecycleError> {
        let mut killer = self.inner.killer.lock().unwrap();
        killer.kill().map_err(|e| LifecycleError::Io(e.to_string()))
    }

    pub fn exit_outcome(&self) -> Option<TerminalExitOutcome> {
        self.inner.exited.lock().unwrap().clone()
    }

    pub fn replay_cursor(&self) -> Option<String> {
        self.inner
            .replay
            .lock()
            .unwrap()
            .back()
            .map(|chunk| chunk.cursor.to_string())
    }
}

impl TerminalSupervisorInner {
    fn push_replay(&self, data: String) -> ReplayChunk {
        let cursor = {
            let mut next_cursor = self.next_cursor.lock().unwrap();
            *next_cursor += 1;
            *next_cursor
        };
        let chunk = ReplayChunk { cursor, data };
        let mut replay = self.replay.lock().unwrap();
        replay.push_back(chunk.clone());
        while replay.len() > REPLAY_LIMIT {
            replay.pop_front();
        }
        chunk
    }

    fn send_live(&self, chunk: ReplayChunk) {
        let mut attachment = self.attachment.lock().unwrap();
        if let Some(channel) = attachment.as_ref() {
            if channel
                .send(TerminalStreamChunk {
                    cursor: chunk.cursor.to_string(),
                    data: chunk.data,
                    kind: TerminalStreamChunkKind::Live,
                })
                .is_err()
            {
                *attachment = None;
            }
        }
    }
}

fn parse_replay_cursor(value: Option<&str>) -> Option<u64> {
    value.and_then(|cursor| cursor.parse::<u64>().ok())
}

fn decode_terminal_output(pending_utf8: &mut Vec<u8>, incoming: &[u8]) -> Option<String> {
    pending_utf8.extend_from_slice(incoming);
    let mut output = String::new();

    loop {
        match std::str::from_utf8(pending_utf8) {
            Ok(decoded) => {
                output.push_str(decoded);
                pending_utf8.clear();
                break;
            }
            Err(error) => {
                let valid_up_to = error.valid_up_to();
                if valid_up_to > 0 {
                    output.push_str(
                        std::str::from_utf8(&pending_utf8[..valid_up_to])
                            .expect("utf8 prefix should already be validated"),
                    );
                }

                match error.error_len() {
                    Some(error_len) => {
                        output.push('\u{FFFD}');
                        pending_utf8.drain(..valid_up_to + error_len);
                        if pending_utf8.is_empty() {
                            break;
                        }
                    }
                    None => {
                        pending_utf8.drain(..valid_up_to);
                        break;
                    }
                }
            }
        }
    }

    if output.is_empty() {
        None
    } else {
        Some(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};
    use tauri::ipc::{Channel, InvokeResponseBody};

    fn wait_until(description: &str, mut predicate: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if predicate() {
                return;
            }

            std::thread::sleep(Duration::from_millis(20));
        }

        panic!("timed out waiting for {description}");
    }

    fn recording_channel(
        chunks: Arc<Mutex<Vec<TerminalStreamChunk>>>,
    ) -> Channel<TerminalStreamChunk> {
        Channel::new(move |body: InvokeResponseBody| {
            let chunk = body
                .deserialize::<TerminalStreamChunk>()
                .expect("valid terminal stream chunk");
            chunks.lock().unwrap().push(chunk);
            Ok(())
        })
    }

    fn joined_output(chunks: &Arc<Mutex<Vec<TerminalStreamChunk>>>) -> String {
        chunks
            .lock()
            .unwrap()
            .iter()
            .map(|chunk| chunk.data.clone())
            .collect::<Vec<_>>()
            .join("")
    }

    fn test_exit_callback() -> (
        Arc<Mutex<Vec<TerminalExitOutcome>>>,
        Arc<dyn Fn(TerminalExitOutcome) + Send + Sync>,
    ) {
        let outcomes = Arc::new(Mutex::new(Vec::new()));
        let outcome_sink = outcomes.clone();
        (
            outcomes,
            Arc::new(move |outcome| {
                outcome_sink.lock().unwrap().push(outcome);
            }),
        )
    }

    #[cfg(not(windows))]
    fn command_for_script(script: &str) -> CommandBuilder {
        let mut command = CommandBuilder::new("sh");
        command.args(["-lc", script]);
        command
    }

    #[cfg(windows)]
    fn command_for_script(script: &str) -> CommandBuilder {
        let mut command = CommandBuilder::new("powershell");
        command.args(["-NoProfile", "-Command", script]);
        command
    }

    #[cfg(not(windows))]
    fn replay_script() -> &'static str {
        "printf 'alpha\\n'; sleep 0.4; printf 'beta\\n';"
    }

    #[cfg(windows)]
    fn replay_script() -> &'static str {
        "Write-Output 'alpha'; Start-Sleep -Milliseconds 400; Write-Output 'beta'"
    }

    #[cfg(not(windows))]
    fn nonzero_exit_script() -> &'static str {
        "printf 'boom\\n'; exit 7"
    }

    #[cfg(windows)]
    fn nonzero_exit_script() -> &'static str {
        "Write-Output 'boom'; exit 7"
    }

    #[test]
    fn attach_replays_output_emitted_while_detached() {
        let (_outcomes, on_exit) = test_exit_callback();
        let supervisor =
            TerminalSupervisor::spawn(command_for_script(replay_script()), 120, 32, false, on_exit)
                .expect("spawn terminal");

        let live_chunks = Arc::new(Mutex::new(Vec::new()));
        supervisor
            .attach(recording_channel(live_chunks.clone()), None)
            .expect("attach live channel");
        wait_until("initial live output", || {
            joined_output(&live_chunks).contains("alpha")
        });

        supervisor.detach();
        std::thread::sleep(Duration::from_millis(650));

        let live_output = joined_output(&live_chunks);
        assert!(live_output.contains("alpha"));
        assert!(
            !live_output.contains("beta"),
            "detached channel should not receive later output: {live_output:?}"
        );

        let replay_chunks = Arc::new(Mutex::new(Vec::new()));
        supervisor
            .attach(recording_channel(replay_chunks.clone()), None)
            .expect("reattach replay channel");
        wait_until("replayed detached output", || {
            joined_output(&replay_chunks).contains("beta")
        });

        let replay_output = joined_output(&replay_chunks);
        assert!(replay_output.contains("alpha"));
        assert!(replay_output.contains("beta"));
        assert!(replay_chunks
            .lock()
            .unwrap()
            .iter()
            .all(|chunk| chunk.kind == TerminalStreamChunkKind::Replay));
    }

    #[test]
    fn attach_with_replay_cursor_skips_already_rendered_output() {
        let (_outcomes, on_exit) = test_exit_callback();
        let supervisor =
            TerminalSupervisor::spawn(command_for_script(replay_script()), 120, 32, false, on_exit)
                .expect("spawn terminal");

        let initial_chunks = Arc::new(Mutex::new(Vec::new()));
        supervisor
            .attach(recording_channel(initial_chunks.clone()), None)
            .expect("attach initial channel");
        wait_until("initial live output", || {
            joined_output(&initial_chunks).contains("alpha")
        });

        let last_seen_cursor = initial_chunks
            .lock()
            .unwrap()
            .last()
            .map(|chunk| chunk.cursor.clone())
            .expect("initial cursor");

        supervisor.detach();
        std::thread::sleep(Duration::from_millis(650));

        let replay_chunks = Arc::new(Mutex::new(Vec::new()));
        supervisor
            .attach(
                recording_channel(replay_chunks.clone()),
                Some(last_seen_cursor.as_str()),
            )
            .expect("reattach replay channel");
        wait_until("replayed unseen output", || {
            joined_output(&replay_chunks).contains("beta")
        });

        let replay_output = joined_output(&replay_chunks);
        assert!(
            !replay_output.contains("alpha"),
            "replay should skip previously rendered output: {replay_output:?}"
        );
        assert!(replay_output.contains("beta"));
        assert!(replay_chunks
            .lock()
            .unwrap()
            .iter()
            .all(|chunk| chunk.kind == TerminalStreamChunkKind::Replay));
    }

    #[test]
    fn decode_terminal_output_preserves_split_utf8_sequences() {
        let mut pending_utf8 = Vec::new();

        let first = decode_terminal_output(&mut pending_utf8, &[0xE2, 0x94]);
        assert_eq!(first, None);
        assert_eq!(pending_utf8, vec![0xE2, 0x94]);

        let second = decode_terminal_output(&mut pending_utf8, &[0x80, b'\n']);
        assert_eq!(second, Some("─\n".to_string()));
        assert!(pending_utf8.is_empty());
    }

    #[test]
    fn harness_nonzero_exit_marks_terminal_failed() {
        let (outcomes, on_exit) = test_exit_callback();
        let supervisor = TerminalSupervisor::spawn(
            command_for_script(nonzero_exit_script()),
            120,
            32,
            true,
            on_exit,
        )
        .expect("spawn terminal");

        wait_until("terminal exit outcome", || {
            supervisor.exit_outcome().is_some()
        });

        let outcome = supervisor.exit_outcome().expect("exit outcome");
        assert_eq!(outcome.exit_code, Some(7));
        assert_eq!(
            outcome.failure_reason,
            Some(TerminalFailureReason::HarnessProcessExitNonzero)
        );
        assert_eq!(outcome.status, TerminalStatus::Failed);

        wait_until("exit callback invocation", || {
            !outcomes.lock().unwrap().is_empty()
        });
        let callback_outcome = outcomes.lock().unwrap().first().cloned().expect("callback");
        assert_eq!(callback_outcome.exit_code, Some(7));
        assert_eq!(callback_outcome.status, TerminalStatus::Failed);
    }
}
