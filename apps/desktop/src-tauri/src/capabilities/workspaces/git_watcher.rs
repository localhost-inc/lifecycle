use super::checkout_type::is_root_workspace_checkout_type;
use crate::platform::db::open_db;
use crate::shared::errors::LifecycleError;
use crate::shared::lifecycle_events::{publish_lifecycle_event, LifecycleEvent};
use crate::RootGitWatcherMap;
use notify::{recommended_watcher, RecursiveMode, Watcher};
use rusqlite::params;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, SyncSender};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::AppHandle;

const WATCHER_POLL_INTERVAL: Duration = Duration::from_millis(500);
const WATCHER_DEBOUNCE_INTERVAL: Duration = Duration::from_millis(150);
const WATCHER_INIT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, PartialEq, Eq)]
struct GitHeadSnapshot {
    ahead: Option<u64>,
    behind: Option<u64>,
    branch: Option<String>,
    head_sha: Option<String>,
    upstream: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PersistedWorkspaceGitSnapshot {
    git_sha: Option<String>,
    source_ref: String,
}

#[derive(Debug)]
struct RootWorkspaceWatchContext {
    host: String,
    checkout_type: String,
    repo_path: String,
}

pub(crate) struct RootGitWatcher {
    stop_requested: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl RootGitWatcher {
    fn start(
        app: &AppHandle,
        db_path: &str,
        workspace_id: &str,
        repo_path: &str,
    ) -> Result<Self, LifecycleError> {
        let git_dir = resolve_git_dir(repo_path)?;
        let stop_requested = Arc::new(AtomicBool::new(false));
        let stop_requested_for_thread = stop_requested.clone();
        let (init_tx, init_rx) = mpsc::sync_channel(1);
        let app = app.clone();
        let db_path = db_path.to_string();
        let repo_path = repo_path.to_string();
        let workspace_id = workspace_id.to_string();
        let thread_name = format!("root-git-watcher-{}", short_workspace_id(&workspace_id));
        let thread = thread::Builder::new()
            .name(thread_name)
            .spawn(move || {
                run_root_git_watcher(
                    app,
                    db_path,
                    workspace_id,
                    repo_path,
                    git_dir,
                    stop_requested_for_thread,
                    init_tx,
                );
            })
            .map_err(|error| LifecycleError::Io(error.to_string()))?;

        match init_rx.recv_timeout(WATCHER_INIT_TIMEOUT) {
            Ok(Ok(())) => Ok(Self {
                stop_requested,
                thread: Some(thread),
            }),
            Ok(Err(error)) => {
                stop_requested.store(true, Ordering::Relaxed);
                let _ = thread.join();
                Err(LifecycleError::Io(error))
            }
            Err(error) => {
                stop_requested.store(true, Ordering::Relaxed);
                let _ = thread.join();
                Err(LifecycleError::Io(format!(
                    "timed out while starting root Git watcher: {error}"
                )))
            }
        }
    }

    fn stop(mut self) {
        self.stop_requested.store(true, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

pub(crate) fn start_root_git_watchers(
    app: &AppHandle,
    db_path: &str,
    watchers: &RootGitWatcherMap,
) -> Result<(), LifecycleError> {
    for workspace_id in list_root_workspace_ids(db_path)? {
        if let Err(error) = ensure_root_git_watcher(app, db_path, watchers, &workspace_id) {
            crate::platform::diagnostics::append_error("root-git-watcher-start", error);
        }
    }

    Ok(())
}

pub(crate) fn ensure_root_git_watcher(
    app: &AppHandle,
    db_path: &str,
    watchers: &RootGitWatcherMap,
    workspace_id: &str,
) -> Result<(), LifecycleError> {
    if root_git_watcher_exists(watchers, workspace_id)? {
        return Ok(());
    }

    let Some(context) = load_root_workspace_watch_context(db_path, workspace_id)? else {
        return Ok(());
    };

    if !is_root_workspace_checkout_type(&context.checkout_type)
        || !matches!(context.host.as_str(), "local" | "docker")
    {
        return Ok(());
    }

    let watcher = RootGitWatcher::start(app, db_path, workspace_id, &context.repo_path)?;
    let mut guard = lock_root_git_watchers(watchers)?;
    if guard.contains_key(workspace_id) {
        drop(guard);
        watcher.stop();
        return Ok(());
    }

    guard.insert(workspace_id.to_string(), watcher);
    Ok(())
}

pub(crate) fn stop_root_git_watcher(watchers: &RootGitWatcherMap, workspace_id: &str) {
    let watcher = match lock_root_git_watchers(watchers) {
        Ok(mut guard) => guard.remove(workspace_id),
        Err(error) => {
            crate::platform::diagnostics::append_error("root-git-watcher-stop", error);
            None
        }
    };

    if let Some(watcher) = watcher {
        watcher.stop();
    }
}

pub(crate) fn stop_root_git_watchers_for_project(
    db_path: &str,
    watchers: &RootGitWatcherMap,
    project_id: &str,
) -> Result<(), LifecycleError> {
    for workspace_id in list_root_workspace_ids_by_project(db_path, project_id)? {
        stop_root_git_watcher(watchers, &workspace_id);
    }

    Ok(())
}

fn short_workspace_id(workspace_id: &str) -> String {
    let short: String = workspace_id
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .take(8)
        .collect();

    if short.is_empty() {
        "workspace".to_string()
    } else {
        short
    }
}

fn lock_root_git_watchers<'a>(
    watchers: &'a RootGitWatcherMap,
) -> Result<
    std::sync::MutexGuard<'a, std::collections::HashMap<String, RootGitWatcher>>,
    LifecycleError,
> {
    watchers
        .lock()
        .map_err(|error| LifecycleError::Io(format!("root Git watcher map lock poisoned: {error}")))
}

fn root_git_watcher_exists(
    watchers: &RootGitWatcherMap,
    workspace_id: &str,
) -> Result<bool, LifecycleError> {
    Ok(lock_root_git_watchers(watchers)?.contains_key(workspace_id))
}

fn list_root_workspace_ids(db_path: &str) -> Result<Vec<String>, LifecycleError> {
    let conn = open_db(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT id
             FROM workspace
             WHERE checkout_type = 'root' AND host IN ('local', 'docker')
             ORDER BY created_at ASC",
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|error| LifecycleError::Database(error.to_string()))?);
    }
    Ok(result)
}

fn list_root_workspace_ids_by_project(
    db_path: &str,
    project_id: &str,
) -> Result<Vec<String>, LifecycleError> {
    let conn = open_db(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT id
             FROM workspace
             WHERE project_id = ?1 AND checkout_type = 'root' AND host IN ('local', 'docker')
             ORDER BY created_at ASC",
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    let rows = stmt
        .query_map(params![project_id], |row| row.get::<_, String>(0))
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|error| LifecycleError::Database(error.to_string()))?);
    }
    Ok(result)
}

fn load_root_workspace_watch_context(
    db_path: &str,
    workspace_id: &str,
) -> Result<Option<RootWorkspaceWatchContext>, LifecycleError> {
    let conn = open_db(db_path)?;
    let result = conn.query_row(
        "SELECT workspace.checkout_type, workspace.host, project.path
         FROM workspace
         INNER JOIN project ON project.id = workspace.project_id
         WHERE workspace.id = ?1
         LIMIT 1",
        params![workspace_id],
        |row| {
            Ok(RootWorkspaceWatchContext {
                checkout_type: row.get(0)?,
                host: row.get(1)?,
                repo_path: row.get(2)?,
            })
        },
    );

    match result {
        Ok(context) => Ok(Some(context)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(LifecycleError::Database(error.to_string())),
    }
}

fn resolve_git_dir(repo_path: &str) -> Result<PathBuf, LifecycleError> {
    let output = Command::new("git")
        .args(["rev-parse", "--git-dir"])
        .current_dir(repo_path)
        .output()
        .map_err(|error| LifecycleError::GitOperationFailed {
            operation: "resolve root workspace Git directory".to_string(),
            reason: error.to_string(),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(LifecycleError::GitOperationFailed {
            operation: "resolve root workspace Git directory".to_string(),
            reason: format!("git rev-parse --git-dir failed: {stderr}"),
        });
    }

    let git_dir_raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let git_dir = PathBuf::from(&git_dir_raw);
    let resolved = if git_dir.is_absolute() {
        git_dir
    } else {
        Path::new(repo_path).join(git_dir)
    };

    Ok(std::fs::canonicalize(&resolved).unwrap_or(resolved))
}

fn run_root_git_watcher(
    app: AppHandle,
    db_path: String,
    workspace_id: String,
    repo_path: String,
    git_dir: PathBuf,
    stop_requested: Arc<AtomicBool>,
    init_tx: SyncSender<Result<(), String>>,
) {
    let (event_tx, event_rx) = mpsc::channel();
    let mut watcher = match recommended_watcher(move |result| {
        let _ = event_tx.send(result);
    }) {
        Ok(watcher) => watcher,
        Err(error) => {
            let _ = init_tx.send(Err(error.to_string()));
            return;
        }
    };

    if let Err(error) = watcher.watch(&git_dir, RecursiveMode::Recursive) {
        let _ = init_tx.send(Err(error.to_string()));
        return;
    }

    if init_tx.send(Ok(())).is_err() {
        return;
    }

    if let Err(error) = sync_root_workspace_git_snapshot(&app, &db_path, &workspace_id, &repo_path)
    {
        crate::platform::diagnostics::append_error("root-git-watcher-initial-sync", error);
    }

    while !stop_requested.load(Ordering::Relaxed) {
        match event_rx.recv_timeout(WATCHER_POLL_INTERVAL) {
            Ok(Ok(_event)) => {
                drain_root_git_watcher_events(&event_rx);
                if let Err(error) =
                    sync_root_workspace_git_snapshot(&app, &db_path, &workspace_id, &repo_path)
                {
                    crate::platform::diagnostics::append_error("root-git-watcher-sync", error);
                }
            }
            Ok(Err(error)) => {
                crate::platform::diagnostics::append_error("root-git-watcher-event", error);
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
}

fn drain_root_git_watcher_events(event_rx: &mpsc::Receiver<Result<notify::Event, notify::Error>>) {
    loop {
        match event_rx.recv_timeout(WATCHER_DEBOUNCE_INTERVAL) {
            Ok(Ok(_event)) => continue,
            Ok(Err(error)) => {
                crate::platform::diagnostics::append_error("root-git-watcher-event", error);
            }
            Err(RecvTimeoutError::Timeout) | Err(RecvTimeoutError::Disconnected) => break,
        }
    }
}

fn sync_root_workspace_git_snapshot(
    app: &AppHandle,
    db_path: &str,
    workspace_id: &str,
    repo_path: &str,
) -> Result<(), LifecycleError> {
    let snapshot = read_git_head_snapshot(repo_path)?;
    if !persist_root_workspace_git_snapshot_if_changed(db_path, workspace_id, &snapshot)? {
        return Ok(());
    }

    publish_lifecycle_event(
        app,
        LifecycleEvent::GitHeadChanged {
            workspace_id: workspace_id.to_string(),
            branch: snapshot.branch.clone(),
            head_sha: snapshot.head_sha.clone(),
            upstream: snapshot.upstream.clone(),
            ahead: snapshot.ahead,
            behind: snapshot.behind,
        },
    );
    publish_lifecycle_event(
        app,
        LifecycleEvent::GitLogChanged {
            workspace_id: workspace_id.to_string(),
            branch: snapshot.branch.clone(),
            head_sha: snapshot.head_sha.clone(),
        },
    );
    publish_lifecycle_event(
        app,
        LifecycleEvent::GitStatusChanged {
            workspace_id: workspace_id.to_string(),
            branch: snapshot.branch,
            head_sha: snapshot.head_sha,
            upstream: snapshot.upstream,
        },
    );

    Ok(())
}

fn read_git_head_snapshot(repo_path: &str) -> Result<GitHeadSnapshot, LifecycleError> {
    let output = Command::new("git")
        .args([
            "status",
            "--porcelain=2",
            "--branch",
            "--untracked-files=no",
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|error| LifecycleError::GitOperationFailed {
            operation: "read root workspace Git head snapshot".to_string(),
            reason: error.to_string(),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(LifecycleError::GitOperationFailed {
            operation: "read root workspace Git head snapshot".to_string(),
            reason: format!("git status --porcelain=2 --branch failed: {stderr}"),
        });
    }

    Ok(parse_git_head_snapshot(
        String::from_utf8_lossy(&output.stdout).as_ref(),
    ))
}

fn parse_git_head_snapshot(output: &str) -> GitHeadSnapshot {
    let mut snapshot = GitHeadSnapshot {
        ahead: None,
        behind: None,
        branch: None,
        head_sha: None,
        upstream: None,
    };

    for line in output.lines() {
        if let Some(value) = line.strip_prefix("# branch.head ") {
            let branch = value.trim();
            snapshot.branch = if branch.starts_with('(') {
                Some("HEAD".to_string())
            } else if branch.is_empty() {
                None
            } else {
                Some(branch.to_string())
            };
            continue;
        }

        if let Some(value) = line.strip_prefix("# branch.oid ") {
            let oid = value.trim();
            if oid != "(initial)" && !oid.is_empty() {
                snapshot.head_sha = Some(oid.to_string());
            }
            continue;
        }

        if let Some(value) = line.strip_prefix("# branch.upstream ") {
            let upstream = value.trim();
            if !upstream.is_empty() {
                snapshot.upstream = Some(upstream.to_string());
            }
            continue;
        }

        if let Some(value) = line.strip_prefix("# branch.ab ") {
            let mut parts = value.split_whitespace();
            snapshot.ahead = parts
                .next()
                .and_then(|ahead| ahead.strip_prefix('+'))
                .and_then(|ahead| ahead.parse::<u64>().ok());
            snapshot.behind = parts
                .next()
                .and_then(|behind| behind.strip_prefix('-'))
                .and_then(|behind| behind.parse::<u64>().ok());
        }
    }

    snapshot
}

fn persist_root_workspace_git_snapshot_if_changed(
    db_path: &str,
    workspace_id: &str,
    snapshot: &GitHeadSnapshot,
) -> Result<bool, LifecycleError> {
    let current = match load_persisted_workspace_git_snapshot(db_path, workspace_id)? {
        Some(current) => current,
        None => return Ok(false),
    };

    let next_source_ref = snapshot
        .branch
        .clone()
        .unwrap_or_else(|| "HEAD".to_string());

    if current.source_ref == next_source_ref
        && current.git_sha.as_ref() == snapshot.head_sha.as_ref()
    {
        return Ok(false);
    }

    let conn = open_db(db_path)?;
    conn.execute(
        "UPDATE workspace
         SET source_ref = ?1,
             git_sha = ?2,
             updated_at = datetime('now')
         WHERE id = ?3",
        params![next_source_ref, snapshot.head_sha.as_deref(), workspace_id],
    )
    .map_err(|error| LifecycleError::Database(error.to_string()))?;
    Ok(true)
}

fn load_persisted_workspace_git_snapshot(
    db_path: &str,
    workspace_id: &str,
) -> Result<Option<PersistedWorkspaceGitSnapshot>, LifecycleError> {
    let conn = open_db(db_path)?;
    let result = conn.query_row(
        "SELECT checkout_type, source_ref, git_sha
         FROM workspace
         WHERE id = ?1
         LIMIT 1",
        params![workspace_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                PersistedWorkspaceGitSnapshot {
                    source_ref: row.get(1)?,
                    git_sha: row.get(2)?,
                },
            ))
        },
    );

    match result {
        Ok((checkout_type, snapshot)) => {
            if is_root_workspace_checkout_type(&checkout_type) {
                Ok(Some(snapshot))
            } else {
                Ok(None)
            }
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(LifecycleError::Database(error.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::db::apply_test_schema;
    use std::fs;
    use std::path::Path;
    use std::process::Command as StdCommand;

    fn temp_db_path() -> String {
        std::env::temp_dir()
            .join(format!(
                "lifecycle-root-git-watcher-{}.db",
                uuid::Uuid::new_v4()
            ))
            .to_string_lossy()
            .into_owned()
    }

    fn temp_repo_path() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("lifecycle-root-git-repo-{}", uuid::Uuid::new_v4()))
    }

    fn run_git(repo_path: &Path, args: &[&str]) {
        let output = StdCommand::new("git")
            .args(args)
            .current_dir(repo_path)
            .output()
            .expect("git command should run");
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            panic!("git {:?} failed: {stderr}", args);
        }
    }

    fn init_repo(repo_path: &Path) {
        fs::create_dir_all(repo_path).expect("create temp repo path");
        run_git(repo_path, &["init"]);
        run_git(repo_path, &["config", "user.email", "test@example.com"]);
        run_git(repo_path, &["config", "user.name", "Lifecycle Test"]);
        fs::write(repo_path.join("README.md"), "seed\n").expect("write seed file");
        run_git(repo_path, &["add", "README.md"]);
        run_git(repo_path, &["commit", "-m", "init"]);
    }

    fn seed_root_workspace(db_path: &str) {
        apply_test_schema(db_path);
        let conn = open_db(db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, name, checkout_type, source_ref, host, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                "workspace_root",
                "project_1",
                "Root",
                "root",
                "main",
                "local",
                "active"
            ],
        )
        .expect("insert root workspace");
    }

    #[test]
    fn parse_git_head_snapshot_reads_branch_metadata() {
        let snapshot = parse_git_head_snapshot(
            "# branch.oid abcdef1234567890\n# branch.head feature/root\n# branch.upstream origin/feature/root\n# branch.ab +2 -1\n",
        );

        assert_eq!(snapshot.branch.as_deref(), Some("feature/root"));
        assert_eq!(snapshot.head_sha.as_deref(), Some("abcdef1234567890"));
        assert_eq!(snapshot.upstream.as_deref(), Some("origin/feature/root"));
        assert_eq!(snapshot.ahead, Some(2));
        assert_eq!(snapshot.behind, Some(1));
    }

    #[test]
    fn parse_git_head_snapshot_normalizes_detached_head() {
        let snapshot =
            parse_git_head_snapshot("# branch.oid abcdef1234567890\n# branch.head (detached)\n");

        assert_eq!(snapshot.branch.as_deref(), Some("HEAD"));
        assert_eq!(snapshot.head_sha.as_deref(), Some("abcdef1234567890"));
    }

    #[test]
    fn persist_root_workspace_git_snapshot_updates_source_ref_and_git_sha() {
        let db_path = temp_db_path();
        seed_root_workspace(&db_path);

        let changed = persist_root_workspace_git_snapshot_if_changed(
            &db_path,
            "workspace_root",
            &GitHeadSnapshot {
                ahead: None,
                behind: None,
                branch: Some("feature/root".to_string()),
                head_sha: Some("abcdef1234567890".to_string()),
                upstream: Some("origin/feature/root".to_string()),
            },
        )
        .expect("persist root snapshot");

        assert!(changed);
        let conn = open_db(&db_path).expect("open db");
        let persisted = conn
            .query_row(
                "SELECT source_ref, git_sha FROM workspace WHERE id = ?1",
                params!["workspace_root"],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .expect("read workspace");
        assert_eq!(persisted.0, "feature/root");
        assert_eq!(persisted.1.as_deref(), Some("abcdef1234567890"));

        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn read_git_head_snapshot_reports_detached_head_as_head() {
        let repo_path = temp_repo_path();
        init_repo(&repo_path);
        let head_sha = StdCommand::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&repo_path)
            .output()
            .expect("resolve head sha");
        let head_sha = String::from_utf8_lossy(&head_sha.stdout).trim().to_string();
        run_git(&repo_path, &["checkout", "--detach", "HEAD"]);

        let snapshot =
            read_git_head_snapshot(repo_path.to_str().expect("repo path should be utf8"))
                .expect("read git head snapshot");

        assert_eq!(snapshot.branch.as_deref(), Some("HEAD"));
        assert_eq!(snapshot.head_sha.as_deref(), Some(head_sha.as_str()));

        let _ = fs::remove_dir_all(repo_path);
    }
}
