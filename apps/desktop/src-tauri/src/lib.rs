mod capabilities;
mod platform;
mod shared;

use crate::platform::db::{run_migrations, DbPath};
use crate::platform::native_terminal;
use crate::platform::runtime::supervisor::Supervisor;
#[cfg(target_os = "macos")]
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};
#[cfg(target_os = "macos")]
use tauri::Emitter;
use tauri::Manager;
use tokio::sync::Mutex as AsyncMutex;

pub use shared::errors::LifecycleError;

pub(crate) type ManagedSupervisor = Arc<AsyncMutex<Supervisor>>;
pub(crate) type SupervisorMap = Arc<AsyncMutex<HashMap<String, ManagedSupervisor>>>;
pub(crate) type RootGitWatcherMap =
    Arc<StdMutex<HashMap<String, capabilities::workspaces::git_watcher::RootGitWatcher>>>;

#[cfg(target_os = "macos")]
const APP_HOTKEY_EVENT_NAME: &str = "app:shortcut";

#[cfg(target_os = "macos")]
const APP_MENU_ITEM_OPEN_SETTINGS: &str = "app.open-settings";

#[cfg(target_os = "macos")]
#[derive(Clone, Serialize)]
struct AppShortcutEvent {
    action: &'static str,
    source: &'static str,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let supervisors: SupervisorMap = Arc::new(AsyncMutex::new(HashMap::new()));
    let root_git_watchers: RootGitWatcherMap = Arc::new(StdMutex::new(HashMap::new()));
    let root_git_watchers_for_setup = root_git_watchers.clone();

    let run_result = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();
            crate::platform::diagnostics::initialize(&app_data_dir);
            let db_path = app_data_dir.join("lifecycle.db");
            let db_path_str = db_path.to_string_lossy().to_string();

            #[cfg(target_os = "macos")]
            match crate::platform::user_shell_env::hydrate_process_environment() {
                Ok(summary) => crate::platform::diagnostics::append_diagnostic(
                    "startup-shell-env",
                    &format!(
                        "hydrated login-shell environment from {} (imported={} skipped={} path_changed={})",
                        summary.shell_path,
                        summary.imported_keys,
                        summary.skipped_keys,
                        summary.path_changed
                    ),
                ),
                Err(error) => {
                    crate::platform::diagnostics::append_error("startup-shell-env", error);
                }
            }

            run_migrations(&db_path_str).expect("failed to run migrations");
            app.manage(DbPath(db_path_str.clone()));

            if let Err(error) = capabilities::workspaces::git_watcher::start_root_git_watchers(
                &app.handle(),
                &db_path_str,
                &root_git_watchers_for_setup,
            ) {
                crate::platform::diagnostics::append_error("root-git-watchers", error);
            }

            if let Err(error) = disable_main_webview_scroll_elasticity(&app.handle()) {
                crate::platform::diagnostics::append_error("main-webview-scroll-elasticity", error);
            }

            if let Err(error) = expand_main_window_for_dev(&app.handle()) {
                crate::platform::diagnostics::append_error("main-window-dev-size", error);
            }

            if native_terminal::is_available() {
                native_terminal::initialize(app.handle().clone(), db_path_str.clone())
                    .expect("failed to initialize native terminal runtime");
            }

            #[cfg(target_os = "macos")]
            {
                setup_app_menu(&app.handle()).expect("failed to initialize application menu");
            }

            Ok(())
        })
        .on_menu_event(|app, event| {
            #[cfg(target_os = "macos")]
            {
                if event.id() == APP_MENU_ITEM_OPEN_SETTINGS {
                    let _ = app.emit(
                        APP_HOTKEY_EVENT_NAME,
                        AppShortcutEvent {
                            action: "open-settings",
                            source: "menu",
                        },
                    );
                    return;
                }
            }
        })
        .manage(supervisors)
        .manage(root_git_watchers)
        .invoke_handler(tauri::generate_handler![
            capabilities::app::commands::set_window_accepts_mouse_moved_events,
            capabilities::app::commands::set_window_pointing_cursor,
            capabilities::app::commands::get_window_mouse_position,
            capabilities::projects::commands::list_projects,
            capabilities::projects::commands::add_project,
            capabilities::projects::commands::remove_project,
            capabilities::projects::commands::update_manifest_status,
            capabilities::workspaces::commands::create_workspace,
            capabilities::workspaces::commands::rename_workspace,
            capabilities::workspaces::commands::start_services,
            capabilities::workspaces::commands::sync_workspace_manifest,
            capabilities::workspaces::commands::stop_workspace,
            capabilities::workspaces::commands::destroy_workspace,
            capabilities::workspaces::commands::get_workspace,
            capabilities::workspaces::commands::get_workspace_by_id,
            capabilities::workspaces::commands::list_workspaces,
            capabilities::workspaces::commands::list_workspaces_by_project,
            capabilities::workspaces::commands::get_workspace_services,
            capabilities::workspaces::commands::update_workspace_service,
            capabilities::workspaces::commands::get_current_branch,
            capabilities::workspaces::commands::list_workspace_terminals,
            capabilities::workspaces::commands::get_terminal,
            capabilities::workspaces::commands::rename_terminal,
            capabilities::workspaces::commands::create_terminal,
            capabilities::workspaces::commands::save_terminal_attachment,
            capabilities::workspaces::commands::sync_native_terminal_surface,
            capabilities::workspaces::commands::hide_native_terminal_surface,
            capabilities::workspaces::commands::detach_terminal,
            capabilities::workspaces::commands::kill_terminal,
            capabilities::workspaces::commands::get_workspace_git_status,
            capabilities::workspaces::commands::get_workspace_git_diff,
            capabilities::workspaces::commands::get_workspace_git_scope_patch,
            capabilities::workspaces::commands::get_workspace_git_changes_patch,
            capabilities::workspaces::commands::list_workspace_git_log,
            capabilities::workspaces::commands::list_workspace_git_pull_requests,
            capabilities::workspaces::commands::get_workspace_current_git_pull_request,
            capabilities::workspaces::commands::get_workspace_git_pull_request,
            capabilities::workspaces::commands::get_workspace_git_base_ref,
            capabilities::workspaces::commands::get_workspace_git_ref_diff_patch,
            capabilities::workspaces::commands::get_workspace_git_pull_request_patch,
            capabilities::workspaces::commands::get_workspace_git_commit_patch,
            capabilities::workspaces::commands::read_workspace_file,
            capabilities::workspaces::commands::open_workspace_file,
            capabilities::workspaces::commands::open_workspace_in_app,
            capabilities::workspaces::commands::list_workspace_open_in_apps,
            capabilities::workspaces::commands::stage_workspace_git_files,
            capabilities::workspaces::commands::unstage_workspace_git_files,
            capabilities::workspaces::commands::commit_workspace_git,
            capabilities::workspaces::commands::push_workspace_git,
            capabilities::workspaces::commands::create_workspace_git_pull_request,
            capabilities::workspaces::commands::merge_workspace_git_pull_request,
        ])
        .run(tauri::generate_context!());

    if let Err(error) = run_result {
        crate::platform::diagnostics::append_error(
            "tauri-run",
            format!("error while running tauri application: {error}"),
        );
        panic!("error while running tauri application: {error}");
    }
}

#[cfg(target_os = "macos")]
fn disable_main_webview_scroll_elasticity(app: &tauri::AppHandle) -> Result<(), LifecycleError> {
    use objc2_app_kit::{NSScrollElasticity, NSView};

    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| LifecycleError::AttachFailed("main webview window not found".to_string()))?;

    main_window
        .with_webview(|webview| unsafe {
            let view: &NSView = &*webview.inner().cast();
            if let Some(scroll_view) = view.enclosingScrollView() {
                scroll_view.setHorizontalScrollElasticity(NSScrollElasticity::None);
                scroll_view.setVerticalScrollElasticity(NSScrollElasticity::None);
            }
        })
        .map_err(|error| LifecycleError::AttachFailed(error.to_string()))
}

#[cfg(not(target_os = "macos"))]
fn disable_main_webview_scroll_elasticity(_app: &tauri::AppHandle) -> Result<(), LifecycleError> {
    Ok(())
}

#[cfg(debug_assertions)]
fn expand_main_window_for_dev(app: &tauri::AppHandle) -> Result<(), LifecycleError> {
    let _ = app;
    Ok(())
}

#[cfg(not(debug_assertions))]
fn expand_main_window_for_dev(_app: &tauri::AppHandle) -> Result<(), LifecycleError> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn setup_app_menu(app: &tauri::AppHandle) -> Result<(), LifecycleError> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

    let settings_item = MenuItemBuilder::with_id(APP_MENU_ITEM_OPEN_SETTINGS, "Settings...")
        .accelerator("CmdOrCtrl+,")
        .build(app)
        .map_err(|error| {
            LifecycleError::AttachFailed(format!("failed to build app menu: {error}"))
        })?;

    let lifecycle_menu = SubmenuBuilder::new(app, "Lifecycle")
        .about(None)
        .separator()
        .item(&settings_item)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .separator()
        .quit()
        .build()
        .map_err(|error| {
            LifecycleError::AttachFailed(format!("failed to build app menu: {error}"))
        })?;

    let menu = MenuBuilder::new(app)
        .item(&lifecycle_menu)
        .build()
        .map_err(|error| {
            LifecycleError::AttachFailed(format!("failed to build root menu: {error}"))
        })?;

    menu.set_as_app_menu().map_err(|error| {
        LifecycleError::AttachFailed(format!("failed to install app menu: {error}"))
    })?;

    Ok(())
}
