use crate::platform::db::open_db;
use crate::shared::errors::LifecycleError;
use rusqlite::params;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use tauri::AppHandle;

use super::harness::normalize_prompt_text;
use super::kind::is_root_workspace_kind;
use super::naming;
use super::rename;
use super::title;

fn workspace_identity_registry() -> &'static Mutex<HashSet<String>> {
    static REGISTRY: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashSet::new()))
}

struct WorkspaceIdentityGuard {
    workspace_id: String,
}

impl WorkspaceIdentityGuard {
    fn acquire(workspace_id: &str) -> Option<Self> {
        let mut registry = workspace_identity_registry().lock().unwrap();
        if !registry.insert(workspace_id.to_string()) {
            return None;
        }

        Some(Self {
            workspace_id: workspace_id.to_string(),
        })
    }
}

impl Drop for WorkspaceIdentityGuard {
    fn drop(&mut self) {
        let mut registry = workspace_identity_registry().lock().unwrap();
        registry.remove(&self.workspace_id);
    }
}

pub fn maybe_schedule_workspace_identity_from_prompt(
    app: &AppHandle,
    db_path: &str,
    terminal_id: &str,
    workspace_id: &str,
    prompt: &str,
) {
    let should_hydrate = match should_hydrate_workspace_identity(db_path, terminal_id, workspace_id)
    {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!(
                "failed to determine workspace identity eligibility for terminal {}: {error}",
                terminal_id
            );
            return;
        }
    };

    if !should_hydrate {
        title::maybe_schedule_terminal_auto_title_from_prompt(
            app,
            db_path,
            terminal_id,
            workspace_id,
            prompt,
        );
        return;
    }

    let Some(prompt) = normalize_prompt_text(prompt) else {
        return;
    };
    let fallback_title = naming::fallback_terminal_title(&prompt);

    let Some(guard) = WorkspaceIdentityGuard::acquire(workspace_id) else {
        return;
    };

    tracing::info!(
        terminal_id,
        workspace_id,
        prompt_preview = %naming::prompt_preview(&prompt),
        fallback_title = %fallback_title,
        "workspace identity hydration scheduled"
    );

    let app = app.clone();
    let db_path = db_path.to_string();
    let terminal_id = terminal_id.to_string();
    let workspace_id = workspace_id.to_string();

    tauri::async_runtime::spawn(async move {
        let _guard = guard;
        let generation_started_at = Instant::now();
        let generated_titles = naming::generate_identity_titles(&prompt).await;
        let elapsed_ms = generation_started_at.elapsed().as_millis() as u64;

        match generated_titles {
            Ok(Some(generated)) => {
                tracing::info!(
                    terminal_id,
                    workspace_id,
                    source = generated.source,
                    elapsed_ms,
                    workspace_title = %generated.workspace_title,
                    session_title = %generated.session_title,
                    "workspace identity generation completed"
                );

                apply_generated_terminal_title(
                    &app,
                    &db_path,
                    &terminal_id,
                    &workspace_id,
                    &generated.session_title,
                    generated.source,
                    elapsed_ms,
                )
                .await;

                match rename::maybe_apply_generated_workspace_identity(
                    app.clone(),
                    &db_path,
                    &workspace_id,
                    &generated.workspace_title,
                )
                .await
                {
                    Ok(Some(_)) => {
                        tracing::info!(
                            terminal_id,
                            workspace_id,
                            title = %generated.workspace_title,
                            source = generated.source,
                            elapsed_ms,
                            "applied generated workspace identity"
                        );
                    }
                    Ok(None) => {
                        tracing::info!(
                            terminal_id,
                            workspace_id,
                            title = %generated.workspace_title,
                            "skipped generated workspace identity because the workspace is already locked"
                        );
                    }
                    Err(error) => {
                        tracing::warn!(
                            terminal_id,
                            workspace_id,
                            title = %generated.workspace_title,
                            "failed to apply generated workspace identity: {error}"
                        );
                    }
                }
            }
            Ok(None) => {
                tracing::info!(
                    terminal_id,
                    workspace_id,
                    fallback_title = %fallback_title,
                    elapsed_ms,
                    "workspace identity generation unavailable; applying fallback terminal title only"
                );
                apply_generated_terminal_title(
                    &app,
                    &db_path,
                    &terminal_id,
                    &workspace_id,
                    &fallback_title,
                    "fallback",
                    elapsed_ms,
                )
                .await;
            }
            Err(error) => {
                tracing::warn!(
                    terminal_id,
                    workspace_id,
                    fallback_title = %fallback_title,
                    elapsed_ms,
                    "workspace identity generation failed; applying fallback terminal title only: {error}"
                );
                apply_generated_terminal_title(
                    &app,
                    &db_path,
                    &terminal_id,
                    &workspace_id,
                    &fallback_title,
                    "fallback",
                    elapsed_ms,
                )
                .await;
            }
        }
    });
}

fn should_hydrate_workspace_identity(
    db_path: &str,
    terminal_id: &str,
    workspace_id: &str,
) -> Result<bool, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.query_row(
        "SELECT workspace.name_origin, workspace.source_ref_origin, workspace.kind
         FROM terminal
         INNER JOIN workspace ON workspace.id = terminal.workspace_id
         WHERE terminal.id = ?1
           AND workspace.id = ?2
         LIMIT 1",
        params![terminal_id, workspace_id],
        |row| {
            let name_origin: String = row.get(0)?;
            let source_ref_origin: String = row.get(1)?;
            let workspace_kind: String = row.get(2)?;
            Ok(!is_root_workspace_kind(&workspace_kind)
                && name_origin == rename::TitleOrigin::Default.as_str()
                && source_ref_origin == rename::TitleOrigin::Default.as_str())
        },
    )
    .map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => {
            LifecycleError::WorkspaceNotFound(terminal_id.to_string())
        }
        _ => LifecycleError::Database(error.to_string()),
    })
}

async fn apply_generated_terminal_title(
    app: &AppHandle,
    db_path: &str,
    terminal_id: &str,
    workspace_id: &str,
    title: &str,
    source: &str,
    elapsed_ms: u64,
) {
    match rename::maybe_apply_generated_terminal_label(app, db_path, terminal_id, title).await {
        Ok(Some(_)) => {
            tracing::info!(
                terminal_id,
                workspace_id,
                title,
                source,
                elapsed_ms,
                "applied generated terminal title"
            );
        }
        Ok(None) => {
            tracing::info!(
                terminal_id,
                workspace_id,
                title,
                "skipped generated terminal title because the user already renamed it"
            );
        }
        Err(error) => {
            tracing::warn!(
                terminal_id,
                workspace_id,
                title,
                "failed to apply generated terminal label: {error}"
            );
        }
    }
}
