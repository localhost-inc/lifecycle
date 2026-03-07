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

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();
            let db_path = app_data_dir.join("lifecycle.db");
            let db_path_str = db_path.to_string_lossy().to_string();

            run_migrations(&db_path_str).expect("failed to run migrations");
            app.manage(DbPath(db_path_str.clone()));

            if native_terminal::is_available() {
                native_terminal::initialize(app.handle().clone(), db_path_str.clone())
                    .expect("failed to initialize native terminal runtime");
            }

            // Initialize tracing
            tracing_subscriber::fmt::init();

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
