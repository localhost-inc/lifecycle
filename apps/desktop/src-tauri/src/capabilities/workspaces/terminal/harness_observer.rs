use crate::shared::errors::TerminalStatus;
use serde_json::Value;
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime};
use tauri::AppHandle;
use time::{macros::format_description, PrimitiveDateTime};

use super::super::harness::{self, HarnessAdapter};
use super::super::query::TerminalRecord;
use super::events::{
    emit_harness_prompt_submitted, emit_harness_turn_completed, emit_harness_turn_started,
    emit_terminal_updated,
};
use super::harness_binding::{
    promote_harness_session_scope, resolve_bound_harness_session_store_root,
};
use super::launch::HarnessLaunchMode;
use super::persistence::{
    load_terminal_record, update_terminal_harness_launch_mode,
    update_terminal_harness_session_capture,
};

fn terminal_is_finished(status: &str) -> bool {
    matches!(
        TerminalStatus::from_str(status),
        Ok(TerminalStatus::Finished | TerminalStatus::Failed)
    )
}

const HARNESS_SESSION_CAPTURE_POLL_INTERVAL: Duration = Duration::from_millis(500);
const HARNESS_SESSION_CAPTURE_SAFETY_TIMEOUT: Duration = Duration::from_secs(300);
const HARNESS_SESSION_CAPTURE_SLOW_THRESHOLD: Duration = Duration::from_secs(15);
const HARNESS_COMPLETION_WATCH_POLL_INTERVAL: Duration = Duration::from_millis(500);

static HARNESS_SESSION_CAPTURE_INFLIGHT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
static HARNESS_COMPLETION_WATCH_INFLIGHT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
const SQLITE_TERMINAL_TIMESTAMP_FORMAT: &[time::format_description::FormatItem<'static>] =
    format_description!("[year]-[month]-[day] [hour]:[minute]:[second]");

fn harness_session_capture_registry() -> &'static Mutex<HashSet<String>> {
    HARNESS_SESSION_CAPTURE_INFLIGHT.get_or_init(|| Mutex::new(HashSet::new()))
}

fn harness_completion_watch_registry() -> &'static Mutex<HashSet<String>> {
    HARNESS_COMPLETION_WATCH_INFLIGHT.get_or_init(|| Mutex::new(HashSet::new()))
}

fn terminal_launched_after(terminal: &TerminalRecord) -> SystemTime {
    PrimitiveDateTime::parse(&terminal.started_at, SQLITE_TERMINAL_TIMESTAMP_FORMAT)
        .map(|value| value.assume_utc())
        .ok()
        .and_then(|value| {
            let unix_timestamp = value.unix_timestamp();
            (unix_timestamp >= 0)
                .then_some(SystemTime::UNIX_EPOCH + Duration::from_secs(unix_timestamp as u64))
        })
        .unwrap_or_else(SystemTime::now)
}

#[derive(Clone)]
struct HarnessCompletionWatchContext {
    app: AppHandle,
    db_path: String,
    terminal_id: String,
    workspace_id: String,
    harness_provider: Option<String>,
    provider: HarnessAdapter,
    harness_launch_mode: HarnessLaunchMode,
    worktree_path: String,
    bound_session_store_root: Option<PathBuf>,
    launched_after: SystemTime,
}

impl HarnessCompletionWatchContext {
    fn schedule(self, session_id: &str) {
        if !self.provider.supports_session_observer() {
            return;
        }

        let registry = harness_completion_watch_registry();
        {
            let mut inflight = registry.lock().unwrap();
            if !inflight.insert(self.terminal_id.clone()) {
                return;
            }
        }

        let harness_session_id = session_id.to_string();
        let terminal_id = self.terminal_id.clone();
        thread::spawn(move || {
            self.watch(harness_session_id);

            let mut inflight = harness_completion_watch_registry().lock().unwrap();
            inflight.remove(&terminal_id);
        });
    }

    fn watch(self, harness_session_id: String) {
        let mut session_log_path: Option<PathBuf> = None;
        let mut emitted_turn_started_keys = HashSet::new();
        let mut emitted_prompt_keys = HashSet::new();
        let mut emitted_completion_keys = HashSet::new();
        let mut log_offset = 0_u64;
        let mut pending_line_fragment = String::new();

        loop {
            let terminal_finished = match load_terminal_record(&self.db_path, &self.terminal_id) {
                Ok(Some(terminal)) => terminal_is_finished(&terminal.status),
                Ok(None) => return,
                Err(error) => {
                    tracing::warn!(
                        "failed to load terminal {} while watching harness completion: {error}",
                        self.terminal_id
                    );
                    thread::sleep(HARNESS_COMPLETION_WATCH_POLL_INTERVAL);
                    continue;
                }
            };

            if session_log_path.is_none() {
                session_log_path = harness::resolve_harness_session_log_path(
                    self.provider,
                    &self.worktree_path,
                    &harness_session_id,
                    self.bound_session_store_root.as_deref(),
                );
                if session_log_path.is_none() {
                    if terminal_finished {
                        return;
                    }
                    thread::sleep(HARNESS_COMPLETION_WATCH_POLL_INTERVAL);
                    continue;
                }

                if matches!(self.harness_launch_mode, HarnessLaunchMode::New) {
                    if let Err(error) = update_terminal_harness_launch_mode(
                        &self.db_path,
                        &self.terminal_id,
                        HarnessLaunchMode::Resume,
                    ) {
                        tracing::warn!(
                            terminal_id = self.terminal_id,
                            workspace_id = self.workspace_id,
                            harness_provider = self
                                .harness_provider
                                .as_deref()
                                .unwrap_or(self.provider.name),
                            "failed to promote harness launch mode to resume: {error}"
                        );
                    }
                }

                // For resumed sessions (app restart), skip to the end of the log so we
                // only emit events for completions that happen *after* the observer starts.
                // New sessions read from the beginning to catch the first turn.
                log_offset = if matches!(self.harness_launch_mode, HarnessLaunchMode::Resume) {
                    session_log_path
                        .as_ref()
                        .and_then(|p| fs::metadata(p).ok())
                        .map(|m| m.len())
                        .unwrap_or(0)
                } else {
                    0
                };
                pending_line_fragment.clear();
            }

            let Some(path) = session_log_path.clone() else {
                thread::sleep(HARNESS_COMPLETION_WATCH_POLL_INTERVAL);
                continue;
            };

            match read_new_harness_log_lines(&path, &mut log_offset, &mut pending_line_fragment) {
                Ok(lines) => {
                    self.process_log_lines(
                        &lines,
                        &harness_session_id,
                        &mut emitted_turn_started_keys,
                        &mut emitted_prompt_keys,
                        &mut emitted_completion_keys,
                    );
                }
                Err(error) => {
                    tracing::debug!(
                        "failed to tail harness session log for terminal {}: {error}",
                        self.terminal_id
                    );
                    session_log_path = None;
                    log_offset = 0;
                    pending_line_fragment.clear();
                }
            }

            if terminal_finished {
                // The harness process may buffer writes. Give it a moment to flush,
                // then drain any remaining data so we don't miss the final completion.
                if !pending_line_fragment.is_empty() {
                    thread::sleep(Duration::from_millis(100));
                    if let Ok(lines) = read_new_harness_log_lines(
                        &path,
                        &mut log_offset,
                        &mut pending_line_fragment,
                    ) {
                        self.process_log_lines(
                            &lines,
                            &harness_session_id,
                            &mut emitted_turn_started_keys,
                            &mut emitted_prompt_keys,
                            &mut emitted_completion_keys,
                        );
                    }
                }
                if !pending_line_fragment.is_empty() {
                    tracing::warn!(
                        terminal_id = self.terminal_id,
                        harness_provider = self
                            .harness_provider
                            .as_deref()
                            .unwrap_or(self.provider.name),
                        fragment_len = pending_line_fragment.len(),
                        "harness observer exiting with unflushed fragment"
                    );
                }
                return;
            }

            thread::sleep(HARNESS_COMPLETION_WATCH_POLL_INTERVAL);
        }
    }

    fn process_log_lines(
        &self,
        lines: &[String],
        harness_session_id: &str,
        emitted_turn_started_keys: &mut HashSet<String>,
        emitted_prompt_keys: &mut HashSet<String>,
        emitted_completion_keys: &mut HashSet<String>,
    ) {
        for line in lines {
            let Ok(value) = serde_json::from_str::<Value>(line) else {
                continue;
            };
            if !harness::line_is_within_launched_session(&value, self.launched_after) {
                continue;
            }

            if let Some(turn_started) = self.provider.parse_turn_started(&value, line) {
                if !emitted_turn_started_keys.insert(turn_started.start_key.clone()) {
                    continue;
                }
                emit_harness_turn_started(
                    &self.app,
                    &self.terminal_id,
                    &self.workspace_id,
                    self.harness_provider.as_deref(),
                    harness_session_id,
                    turn_started.turn_id.as_deref(),
                );
            }

            if let Some(prompt) = self.provider.parse_prompt_submission(&value, line) {
                if emitted_turn_started_keys.insert(prompt.turn_start_key.clone()) {
                    emit_harness_turn_started(
                        &self.app,
                        &self.terminal_id,
                        &self.workspace_id,
                        self.harness_provider.as_deref(),
                        harness_session_id,
                        prompt.turn_id.as_deref(),
                    );
                }

                if emitted_prompt_keys.insert(prompt.prompt_key.clone()) {
                    tracing::info!(
                        terminal_id = self.terminal_id,
                        workspace_id = self.workspace_id,
                        harness_provider = self
                            .harness_provider
                            .as_deref()
                            .unwrap_or(self.provider.name),
                        harness_session_id,
                        prompt_key = %prompt.prompt_key,
                        turn_id = ?prompt.turn_id,
                        "harness prompt submitted; scheduling auto title"
                    );
                    emit_harness_prompt_submitted(
                        &self.app,
                        &self.terminal_id,
                        &self.workspace_id,
                        self.harness_provider.as_deref(),
                        harness_session_id,
                        &prompt.prompt_text,
                        prompt.turn_id.as_deref(),
                    );
                    super::super::identity::maybe_schedule_workspace_identity_from_prompt(
                        &self.app,
                        &self.db_path,
                        &self.terminal_id,
                        &self.workspace_id,
                        &prompt.prompt_text,
                    );
                }
            }

            if let Some(completion) = self.provider.parse_turn_completion(&value, line) {
                if !emitted_completion_keys.insert(completion.completion_key.clone()) {
                    continue;
                }

                tracing::info!(
                    terminal_id = self.terminal_id,
                    workspace_id = self.workspace_id,
                    harness_provider = self
                        .harness_provider
                        .as_deref()
                        .unwrap_or(self.provider.name),
                    harness_session_id,
                    completion_key = %completion.completion_key,
                    turn_id = ?completion.turn_id,
                    "harness turn completed"
                );
                emit_harness_turn_completed(
                    &self.app,
                    &self.terminal_id,
                    &self.workspace_id,
                    self.harness_provider.as_deref(),
                    harness_session_id,
                    &completion.completion_key,
                    completion.turn_id.as_deref(),
                );
            } else {
                // Log unmatched lines that look like they could be completions
                // to aid debugging of format mismatches.
                let line_type = value.get("type").and_then(Value::as_str);
                if matches!(line_type, Some("assistant" | "result" | "event_msg")) {
                    tracing::debug!(
                        terminal_id = self.terminal_id,
                        harness_provider = self
                            .harness_provider
                            .as_deref()
                            .unwrap_or(self.provider.name),
                        line_type = ?line_type,
                        "harness log line has completion-like type but did not match as turn completion"
                    );
                }
            }
        }
    }
}

pub(crate) fn maybe_schedule_harness_observers(
    app: &AppHandle,
    db_path: &str,
    terminal: &TerminalRecord,
    worktree_path: &str,
) {
    let Some(provider) = harness::resolve_harness_adapter(terminal.harness_provider.as_deref())
    else {
        return;
    };

    let completion_watch = HarnessCompletionWatchContext {
        app: app.clone(),
        db_path: db_path.to_string(),
        terminal_id: terminal.id.clone(),
        workspace_id: terminal.workspace_id.clone(),
        harness_provider: terminal.harness_provider.clone(),
        provider,
        harness_launch_mode: HarnessLaunchMode::from_str(&terminal.harness_launch_mode)
            .unwrap_or(HarnessLaunchMode::Resume),
        worktree_path: worktree_path.to_string(),
        bound_session_store_root: resolve_bound_harness_session_store_root(app, terminal)
            .ok()
            .flatten(),
        launched_after: terminal_launched_after(terminal),
    };

    if let Some(session_id) = terminal.harness_session_id.as_deref() {
        completion_watch.schedule(session_id);
        return;
    }

    let capture_key = terminal.id.clone();
    let registry = harness_session_capture_registry();
    {
        let mut inflight = registry.lock().unwrap();
        if !inflight.insert(capture_key.clone()) {
            return;
        }
    }

    let app = app.clone();
    let db_path = db_path.to_string();
    let terminal_id = terminal.id.clone();
    let worktree_path = worktree_path.to_string();

    thread::spawn(move || {
        capture_harness_session(&app, &db_path, &terminal_id, provider, &worktree_path);

        let mut inflight = harness_session_capture_registry().lock().unwrap();
        inflight.remove(&capture_key);
    });
}

fn capture_harness_session(
    app: &AppHandle,
    db_path: &str,
    terminal_id: &str,
    provider: HarnessAdapter,
    worktree_path: &str,
) {
    let deadline = SystemTime::now()
        .checked_add(HARNESS_SESSION_CAPTURE_SAFETY_TIMEOUT)
        .unwrap_or_else(SystemTime::now);
    let slow_threshold = SystemTime::now()
        .checked_add(HARNESS_SESSION_CAPTURE_SLOW_THRESHOLD)
        .unwrap_or_else(SystemTime::now);
    let mut warned_slow = false;

    loop {
        let now = SystemTime::now();
        if now > deadline {
            tracing::warn!(
                terminal_id,
                harness_provider = provider.name,
                "harness session capture timed out after safety timeout"
            );
            return;
        }
        if !warned_slow && now > slow_threshold {
            warned_slow = true;
            tracing::warn!(
                terminal_id,
                harness_provider = provider.name,
                "harness session capture is taking longer than expected"
            );
        }

        let terminal = match load_terminal_record(db_path, terminal_id) {
            Ok(Some(terminal)) => terminal,
            Ok(None) => return,
            Err(error) => {
                tracing::warn!(
                    terminal_id,
                    harness_provider = provider.name,
                    "failed to load pending harness terminal: {error}"
                );
                return;
            }
        };
        if terminal_is_finished(&terminal.status) {
            return;
        }
        if terminal.harness_session_id.is_some() {
            return;
        }

        let bound_session_store_root = resolve_bound_harness_session_store_root(app, &terminal)
            .ok()
            .flatten();
        let Some(session_id) = harness::discover_harness_session_candidates(
            provider,
            worktree_path,
            terminal_launched_after(&terminal),
            bound_session_store_root.as_deref(),
        )
        .into_iter()
        .next()
        .map(|candidate| candidate.session_id) else {
            thread::sleep(HARNESS_SESSION_CAPTURE_POLL_INTERVAL);
            continue;
        };

        let updated_terminal =
            match update_terminal_harness_session_capture(db_path, &terminal.id, &session_id) {
                Ok(updated_terminal) => updated_terminal,
                Err(error) => {
                    tracing::warn!(
                        terminal_id = terminal.id.as_str(),
                        workspace_id = terminal.workspace_id.as_str(),
                        harness_provider = provider.name,
                        "failed to persist harness session id: {error}"
                    );
                    return;
                }
            };

        if updated_terminal.harness_session_id.as_deref() != Some(session_id.as_str()) {
            tracing::warn!(
                terminal_id = terminal.id.as_str(),
                workspace_id = terminal.workspace_id.as_str(),
                harness_provider = provider.name,
                discovered_session_id = session_id,
                persisted_session_id = ?updated_terminal.harness_session_id,
                "skipping harness observer scheduling because the terminal session id did not persist"
            );
            return;
        }

        if let Err(error) = promote_harness_session_scope(app, &terminal, &session_id) {
            tracing::warn!(
                terminal_id = terminal.id.as_str(),
                workspace_id = terminal.workspace_id.as_str(),
                harness_provider = provider.name,
                "failed to promote harness session scope: {error}"
            );
        }

        emit_terminal_updated(app, &updated_terminal);
        HarnessCompletionWatchContext {
            app: app.clone(),
            db_path: db_path.to_string(),
            terminal_id: updated_terminal.id.clone(),
            workspace_id: updated_terminal.workspace_id.clone(),
            harness_provider: updated_terminal.harness_provider.clone(),
            provider,
            // Use New so the observer reads from the start of the log — the
            // session was just captured so we must not skip events that were
            // written before the observer started.
            harness_launch_mode: HarnessLaunchMode::New,
            worktree_path: worktree_path.to_string(),
            bound_session_store_root: resolve_bound_harness_session_store_root(
                app,
                &updated_terminal,
            )
            .ok()
            .flatten(),
            launched_after: terminal_launched_after(&updated_terminal),
        }
        .schedule(&session_id);
        return;
    }
}

fn read_new_harness_log_lines(
    path: &Path,
    offset: &mut u64,
    pending_line_fragment: &mut String,
) -> Result<Vec<String>, std::io::Error> {
    let metadata = fs::metadata(path)?;
    let file_len = metadata.len();
    if file_len < *offset {
        *offset = file_len;
        pending_line_fragment.clear();
        return Ok(Vec::new());
    }

    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(*offset))?;

    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    // Advance offset by the actual number of bytes read rather than
    // relying on metadata.len(). The file may have grown between the
    // metadata() and read_to_end() calls; using the metadata length
    // would cause the next iteration to re-read overlapping bytes and
    // corrupt the pending line fragment.
    *offset += bytes.len() as u64;

    if !bytes.is_empty() {
        pending_line_fragment.push_str(&String::from_utf8_lossy(&bytes));
    }

    let mut lines = Vec::new();
    while let Some(newline_index) = pending_line_fragment.find('\n') {
        let line = pending_line_fragment[..newline_index]
            .trim_end_matches('\r')
            .to_string();
        pending_line_fragment.drain(..=newline_index);
        if !line.is_empty() {
            lines.push(line);
        }
    }

    // Flush the remaining fragment if it is already valid JSON. This handles
    // JSONL entries that haven't been newline-terminated yet (e.g. the last
    // line written by the harness before going idle between turns).
    if !pending_line_fragment.is_empty() {
        let candidate = pending_line_fragment.trim_end_matches('\r');
        if !candidate.is_empty() && serde_json::from_str::<Value>(candidate).is_ok() {
            lines.push(candidate.to_string());
            pending_line_fragment.clear();
        }
    }

    Ok(lines)
}

#[cfg(test)]
mod tests {
    use crate::capabilities::workspaces::query::TerminalRecord;
    use crate::capabilities::workspaces::terminal::launch::HarnessLaunchMode;
    use std::time::{Duration, SystemTime};

    use super::terminal_launched_after;

    fn terminal(
        id: &str,
        started_at: &str,
        harness_launch_mode: HarnessLaunchMode,
    ) -> TerminalRecord {
        TerminalRecord {
            id: id.to_string(),
            workspace_id: "workspace-1".to_string(),
            launch_type: "harness".to_string(),
            harness_provider: Some("codex".to_string()),
            harness_session_id: None,
            harness_launch_mode: harness_launch_mode.as_str().to_string(),
            created_by: None,
            label: id.to_string(),
            label_origin: Some("default".to_string()),
            status: "active".to_string(),
            failure_reason: None,
            exit_code: None,
            started_at: started_at.to_string(),
            last_active_at: started_at.to_string(),
            ended_at: None,
        }
    }

    #[test]
    fn terminal_launched_after_parses_sqlite_timestamps() {
        let launched_after = terminal_launched_after(&terminal(
            "terminal-a",
            "1970-01-01 00:00:10",
            HarnessLaunchMode::New,
        ));

        assert_eq!(
            launched_after
                .duration_since(SystemTime::UNIX_EPOCH)
                .expect("duration")
                .as_secs(),
            10
        );
    }

    #[test]
    fn terminal_launched_after_falls_back_to_now_for_invalid_values() {
        let before = SystemTime::now();
        let launched_after = terminal_launched_after(&terminal(
            "terminal-a",
            "not-a-timestamp",
            HarnessLaunchMode::Resume,
        ));
        let after = SystemTime::now();

        assert!(launched_after >= before - Duration::from_secs(1));
        assert!(launched_after <= after + Duration::from_secs(1));
    }
}
