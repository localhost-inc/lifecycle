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

use super::super::harness::{self, HarnessAdapter};
use super::super::query::TerminalRecord;
use super::events::{emit_harness_prompt_submitted, emit_harness_turn_completed};
use super::persistence::{
    load_claimed_harness_session_ids, load_terminal_record, update_terminal_harness_session_id,
};

fn terminal_is_finished(status: &str) -> bool {
    matches!(
        TerminalStatus::from_str(status),
        Ok(TerminalStatus::Finished | TerminalStatus::Failed)
    )
}

const HARNESS_SESSION_CAPTURE_POLL_INTERVAL: Duration = Duration::from_millis(500);
const HARNESS_SESSION_CAPTURE_TIMEOUT: Duration = Duration::from_secs(15);
const HARNESS_COMPLETION_WATCH_POLL_INTERVAL: Duration = Duration::from_millis(500);

static HARNESS_SESSION_CAPTURE_INFLIGHT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
static HARNESS_COMPLETION_WATCH_INFLIGHT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn harness_session_capture_registry() -> &'static Mutex<HashSet<String>> {
    HARNESS_SESSION_CAPTURE_INFLIGHT.get_or_init(|| Mutex::new(HashSet::new()))
}

fn harness_completion_watch_registry() -> &'static Mutex<HashSet<String>> {
    HARNESS_COMPLETION_WATCH_INFLIGHT.get_or_init(|| Mutex::new(HashSet::new()))
}

#[derive(Clone)]
struct HarnessCompletionWatchContext {
    app: AppHandle,
    db_path: String,
    terminal_id: String,
    workspace_id: String,
    harness_provider: Option<String>,
    provider: HarnessAdapter,
    worktree_path: String,
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
        let mut emitted_prompt_keys = HashSet::new();
        let mut emitted_completion_keys = HashSet::new();
        let mut log_offset = 0_u64;
        let mut pending_line_fragment = String::new();

        loop {
            match load_terminal_record(&self.db_path, &self.terminal_id) {
                Ok(Some(terminal)) => {
                    if terminal_is_finished(&terminal.status) {
                        return;
                    }
                }
                Ok(None) => return,
                Err(error) => {
                    tracing::warn!(
                        "failed to load terminal {} while watching harness completion: {error}",
                        self.terminal_id
                    );
                    return;
                }
            }

            if session_log_path.is_none() {
                session_log_path = harness::resolve_harness_session_log_path(
                    self.provider,
                    &self.worktree_path,
                    &harness_session_id,
                );
                if session_log_path.is_none() {
                    thread::sleep(HARNESS_COMPLETION_WATCH_POLL_INTERVAL);
                    continue;
                }

                log_offset = 0;
                pending_line_fragment.clear();
            }

            let Some(path) = session_log_path.as_ref() else {
                thread::sleep(HARNESS_COMPLETION_WATCH_POLL_INTERVAL);
                continue;
            };

            match read_new_harness_log_lines(path, &mut log_offset, &mut pending_line_fragment) {
                Ok(lines) => {
                    for line in lines {
                        let Ok(value) = serde_json::from_str::<Value>(&line) else {
                            continue;
                        };
                        if !harness::line_is_within_launched_session(&value, self.launched_after) {
                            continue;
                        }

                        if let Some(prompt) = self.provider.parse_prompt_submission(&value, &line) {
                            if emitted_prompt_keys.insert(prompt.prompt_key.clone()) {
                                tracing::info!(
                                    terminal_id = self.terminal_id,
                                    workspace_id = self.workspace_id,
                                    harness_provider = self.harness_provider.as_deref().unwrap_or(self.provider.name),
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
                                    &harness_session_id,
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

                        let Some(completion) = self.provider.parse_turn_completion(&value, &line)
                        else {
                            continue;
                        };
                        if !emitted_completion_keys.insert(completion.completion_key.clone()) {
                            continue;
                        }

                        emit_harness_turn_completed(
                            &self.app,
                            &self.terminal_id,
                            &self.workspace_id,
                            self.harness_provider.as_deref(),
                            &harness_session_id,
                            &completion.completion_key,
                            completion.turn_id.as_deref(),
                        );
                    }
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

            thread::sleep(HARNESS_COMPLETION_WATCH_POLL_INTERVAL);
        }
    }
}

pub(crate) fn maybe_schedule_harness_observers(
    app: &AppHandle,
    db_path: &str,
    terminal: &TerminalRecord,
    worktree_path: &str,
    launched_after: SystemTime,
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
        worktree_path: worktree_path.to_string(),
        launched_after,
    };

    if let Some(session_id) = terminal.harness_session_id.as_deref() {
        completion_watch.schedule(session_id);
        return;
    }

    let registry = harness_session_capture_registry();
    {
        let mut inflight = registry.lock().unwrap();
        if !inflight.insert(terminal.id.clone()) {
            return;
        }
    }

    let db_path = db_path.to_string();
    let terminal_id = terminal.id.clone();
    let workspace_id = terminal.workspace_id.clone();
    let worktree_path = worktree_path.to_string();

    thread::spawn(move || {
        let capture_result = wait_for_harness_session_id(
            &db_path,
            &terminal_id,
            &workspace_id,
            provider,
            &worktree_path,
            launched_after,
        );

        if let Some(session_id) = capture_result {
            if let Err(error) =
                update_terminal_harness_session_id(&db_path, &terminal_id, &session_id)
            {
                tracing::warn!(
                    "failed to persist {} harness session id for terminal {}: {error}",
                    provider.name,
                    terminal_id
                );
            }

            HarnessCompletionWatchContext {
                app: completion_watch.app.clone(),
                db_path: db_path.clone(),
                terminal_id: terminal_id.clone(),
                workspace_id: workspace_id.clone(),
                harness_provider: Some(provider.name.to_string()),
                provider,
                worktree_path: worktree_path.clone(),
                launched_after,
            }
            .schedule(&session_id);
        }

        let mut inflight = harness_session_capture_registry().lock().unwrap();
        inflight.remove(&terminal_id);
    });
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
    *offset = file_len;

    if bytes.is_empty() {
        return Ok(Vec::new());
    }

    pending_line_fragment.push_str(&String::from_utf8_lossy(&bytes));

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

    Ok(lines)
}

fn wait_for_harness_session_id(
    db_path: &str,
    terminal_id: &str,
    workspace_id: &str,
    provider: HarnessAdapter,
    worktree_path: &str,
    launched_after: SystemTime,
) -> Option<String> {
    let deadline = SystemTime::now()
        .checked_add(HARNESS_SESSION_CAPTURE_TIMEOUT)
        .unwrap_or_else(SystemTime::now);

    loop {
        if SystemTime::now() > deadline {
            return None;
        }

        match load_terminal_record(db_path, terminal_id) {
            Ok(Some(terminal)) => {
                if let Some(session_id) = terminal.harness_session_id {
                    return Some(session_id);
                }
                if terminal_is_finished(&terminal.status) {
                    return None;
                }
            }
            Ok(None) | Err(_) => return None,
        }

        let claimed_session_ids =
            load_claimed_harness_session_ids(db_path, workspace_id, provider.name, terminal_id)
                .unwrap_or_default();

        if let Some(session_id) = harness::discover_harness_session_id(
            provider,
            worktree_path,
            launched_after,
            &claimed_session_ids,
        ) {
            return Some(session_id);
        }

        thread::sleep(HARNESS_SESSION_CAPTURE_POLL_INTERVAL);
    }
}
