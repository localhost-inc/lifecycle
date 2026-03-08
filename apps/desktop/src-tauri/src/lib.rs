mod capabilities;
mod platform;
mod shared;

use crate::platform::db::{run_migrations, DbPath};
use crate::platform::native_terminal;
use crate::platform::runtime::supervisor::Supervisor;
use crate::platform::runtime::terminal::TerminalSupervisor;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

pub use shared::errors::LifecycleError;

pub type SupervisorMap = Arc<Mutex<HashMap<String, Supervisor>>>;
pub type TerminalSupervisorMap = Arc<Mutex<HashMap<String, TerminalSupervisor>>>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let supervisors: SupervisorMap = Arc::new(Mutex::new(HashMap::new()));
    let terminal_supervisors: TerminalSupervisorMap = Arc::new(Mutex::new(HashMap::new()));

    let run_result = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();
            crate::platform::diagnostics::initialize(&app_data_dir);
            let db_path = app_data_dir.join("lifecycle.db");
            let db_path_str = db_path.to_string_lossy().to_string();

            run_migrations(&db_path_str).expect("failed to run migrations");
            app.manage(DbPath(db_path_str.clone()));

            if let Err(error) = disable_main_webview_scroll_elasticity(&app.handle()) {
                crate::platform::diagnostics::append_error("main-webview-scroll-elasticity", error);
            }

            if native_terminal::is_available() {
                native_terminal::initialize(app.handle().clone(), db_path_str.clone())
                    .expect("failed to initialize native terminal runtime");
            }

            Ok(())
        })
        .manage(supervisors)
        .manage(terminal_supervisors)
        .invoke_handler(tauri::generate_handler![
            capabilities::projects::commands::list_projects,
            capabilities::projects::commands::add_project,
            capabilities::projects::commands::remove_project,
            capabilities::projects::commands::update_manifest_status,
            capabilities::workspaces::commands::create_workspace,
            capabilities::workspaces::commands::start_services,
            capabilities::workspaces::commands::stop_workspace,
            capabilities::workspaces::commands::get_workspace,
            capabilities::workspaces::commands::get_workspace_by_id,
            capabilities::workspaces::commands::list_workspaces,
            capabilities::workspaces::commands::list_workspaces_by_project,
            capabilities::workspaces::commands::get_workspace_services,
            capabilities::workspaces::commands::get_current_branch,
            capabilities::workspaces::commands::list_workspace_terminals,
            capabilities::workspaces::commands::get_terminal,
            capabilities::workspaces::commands::create_terminal,
            capabilities::workspaces::commands::attach_terminal,
            capabilities::workspaces::commands::write_terminal,
            capabilities::workspaces::commands::save_terminal_attachment,
            capabilities::workspaces::commands::native_terminal_capabilities,
            capabilities::workspaces::commands::sync_native_terminal_surface,
            capabilities::workspaces::commands::hide_native_terminal_surface,
            capabilities::workspaces::commands::resize_terminal,
            capabilities::workspaces::commands::detach_terminal,
            capabilities::workspaces::commands::kill_terminal,
            capabilities::workspaces::commands::get_workspace_git_status,
            capabilities::workspaces::commands::get_workspace_git_diff,
            capabilities::workspaces::commands::list_workspace_git_log,
            capabilities::workspaces::commands::get_workspace_git_base_ref,
            capabilities::workspaces::commands::get_workspace_git_commit_patch,
            capabilities::workspaces::commands::open_workspace_file,
            capabilities::workspaces::commands::stage_workspace_git_files,
            capabilities::workspaces::commands::unstage_workspace_git_files,
            capabilities::workspaces::commands::commit_workspace_git,
            capabilities::workspaces::commands::push_workspace_git,
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
