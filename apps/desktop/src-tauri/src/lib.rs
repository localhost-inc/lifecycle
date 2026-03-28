mod capabilities;
mod platform;
mod shared;

use crate::platform::app_config::AppConfigPath;
use crate::platform::process_manager::ProcessManagerHandle;
#[cfg(target_os = "macos")]
use serde::Serialize;
#[cfg(target_os = "macos")]
use tauri::Emitter;
use tauri::Manager;

pub use shared::errors::LifecycleError;

#[cfg(target_os = "macos")]
const APP_HOTKEY_EVENT_NAME: &str = "app:shortcut";

#[cfg(target_os = "macos")]
const APP_MENU_ITEM_OPEN_SETTINGS: &str = "app.open-settings";

#[cfg(target_os = "macos")]
const APP_MENU_ITEM_OPEN_COMMAND_PALETTE: &str = "app.open-command-palette";

#[cfg(target_os = "macos")]
const APP_MENU_ITEM_OPEN_FILE_PICKER: &str = "app.open-file-picker";

#[cfg(target_os = "macos")]
pub(crate) const APP_MENU_ITEM_SELECT_PROJECT_PREFIX: &str = "app.select-project-";

#[cfg(target_os = "macos")]
const APP_MENU_ITEM_QUIT: &str = "app.quit";

#[cfg(target_os = "macos")]
#[derive(Clone, Serialize)]
struct AppShortcutEvent {
    action: &'static str,
    index: Option<u32>,
    source: &'static str,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {

    let run_result = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();
            crate::platform::diagnostics::initialize(&app_data_dir);

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

            let lifecycle_cli = match crate::platform::lifecycle_cli::LifecycleCliState::initialize(
                &app.handle(),
            ) {
                Ok(cli) => cli,
                Err(error) => {
                    crate::platform::diagnostics::append_error("lifecycle-cli", error);
                    crate::platform::lifecycle_cli::LifecycleCliState::disabled()
                }
            };
            app.manage(lifecycle_cli);

            crate::platform::preview_proxy::start_preview_proxy(&app_data_dir)
                .expect("failed to initialize local preview proxy");

            let config_path =
                crate::platform::app_config::resolve_config_path().expect("failed to resolve config path");
            app.manage(AppConfigPath(config_path));

            let bridge = match capabilities::bridge::BridgeState::start(app.handle().clone()) {
                Ok(bridge) => bridge,
                Err(error) => {
                    crate::platform::diagnostics::append_error("bridge", error);
                    capabilities::bridge::BridgeState::disabled()
                }
            };
            app.manage(bridge);

            if let Err(error) = disable_main_webview_scroll_elasticity(&app.handle()) {
                crate::platform::diagnostics::append_error("main-webview-scroll-elasticity", error);
            }

            if let Err(error) = disable_main_webview_context_menu(&app.handle()) {
                crate::platform::diagnostics::append_error("main-webview-context-menu", error);
            }

            if let Err(error) = suppress_escape_beep(&app.handle()) {
                crate::platform::diagnostics::append_error("suppress-escape-beep", error);
            }

            if let Err(error) = expand_main_window_for_dev(&app.handle()) {
                crate::platform::diagnostics::append_error("main-window-dev-size", error);
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
                if event.id() == APP_MENU_ITEM_QUIT {
                    let app_handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        confirm_and_exit(app_handle).await;
                    });
                    return;
                }

                if event.id() == APP_MENU_ITEM_OPEN_SETTINGS {
                    let _ = app.emit(
                        APP_HOTKEY_EVENT_NAME,
                        AppShortcutEvent {
                            action: "open-settings",
                            index: None,
                            source: "menu",
                        },
                    );
                    return;
                }

                if event.id() == APP_MENU_ITEM_OPEN_COMMAND_PALETTE {
                    let _ = app.emit(
                        APP_HOTKEY_EVENT_NAME,
                        AppShortcutEvent {
                            action: "open-command-palette",
                            index: None,
                            source: "menu",
                        },
                    );
                    return;
                }

                if event.id() == APP_MENU_ITEM_OPEN_FILE_PICKER {
                    let _ = app.emit(
                        APP_HOTKEY_EVENT_NAME,
                        AppShortcutEvent {
                            action: "open-file-picker",
                            index: None,
                            source: "menu",
                        },
                    );
                    return;
                }

                if let Some(index_str) = event.id().0.strip_prefix(APP_MENU_ITEM_SELECT_PROJECT_PREFIX) {
                    if let Ok(index) = index_str.parse::<u32>() {
                        let _ = app.emit(
                            APP_HOTKEY_EVENT_NAME,
                            AppShortcutEvent {
                                action: "select-project-index",
                                index: Some(index),
                                source: "menu",
                            },
                        );
                        return;
                    }
                }
            }
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app_handle = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    confirm_and_exit(app_handle).await;
                });
            }
        })
        .manage(ProcessManagerHandle::new())
        .invoke_handler(tauri::generate_handler![
            capabilities::app::commands::get_app_config,
            capabilities::app::commands::write_app_config,
            capabilities::app::commands::get_auth_session,
            capabilities::process::commands::spawn_managed_process,
            capabilities::process::commands::kill_managed_process,
            capabilities::process::commands::kill_process_by_pid,
            capabilities::process::commands::start_managed_container,
            capabilities::process::commands::stop_managed_container,
            capabilities::process::commands::pull_docker_image,
            capabilities::process::commands::build_docker_image,
            capabilities::process::commands::check_health,
            capabilities::process::commands::wait_for_health,
            capabilities::app::commands::read_json_file,
            capabilities::app::commands::resolve_lifecycle_root_path,
            capabilities::bridge::bridge_create_agent_session,
            capabilities::bridge::bridge_complete_shell_request,
            capabilities::bridge::bridge_fail_shell_request,
            capabilities::app::commands::set_window_accepts_mouse_moved_events,
            capabilities::app::commands::set_window_pointing_cursor,
            capabilities::app::commands::get_window_mouse_position,
            capabilities::process::commands::run_shell_step,
            capabilities::process::commands::assign_ports,
            capabilities::app::commands::get_preview_proxy_port,
            capabilities::app::commands::register_proxy_target,
            capabilities::app::commands::remove_proxy_target,
            capabilities::git::commands::get_git_current_branch,
            capabilities::git::commands::get_git_sha,
            capabilities::git::commands::create_git_worktree,
            capabilities::git::commands::remove_git_worktree,
            capabilities::git::commands::rename_git_worktree_branch,
            capabilities::git::commands::get_git_status,
            capabilities::git::commands::get_git_diff,
            capabilities::git::commands::get_git_scope_patch,
            capabilities::git::commands::get_git_changes_patch,
            capabilities::git::commands::list_git_log,
            capabilities::git::commands::get_git_base_ref,
            capabilities::git::commands::get_git_ref_diff_patch,
            capabilities::git::commands::get_git_commit_patch,
            capabilities::git::commands::stage_git_files,
            capabilities::git::commands::unstage_git_files,
            capabilities::git::commands::commit_git,
            capabilities::git::commands::push_git,
            capabilities::git::commands::list_git_pull_requests,
            capabilities::git::commands::get_current_git_pull_request,
            capabilities::git::commands::get_git_pull_request,
            capabilities::git::commands::get_git_pull_request_patch,
            capabilities::git::commands::create_git_pull_request,
            capabilities::git::commands::merge_git_pull_request,
            capabilities::git::commands::git_branch_has_upstream,
            capabilities::files::commands::read_file,
            capabilities::files::commands::write_file,
            capabilities::files::commands::list_files,
            capabilities::files::commands::open_file,
            capabilities::files::commands::open_in_app,
            capabilities::files::commands::list_open_in_apps,
            capabilities::app::commands::sync_project_menu,
        ])
        .build(tauri::generate_context!());

    match run_result {
        Ok(app) => app.run(|_app_handle, _event| {}),
        Err(error) => {
            crate::platform::diagnostics::append_error(
                "tauri-run",
                format!("error while running tauri application: {error}"),
            );
            panic!("error while running tauri application: {error}");
        }
    }
}

async fn confirm_and_exit(app: tauri::AppHandle) {
    use std::sync::atomic::{AtomicBool, Ordering};
    static CONFIRMING: AtomicBool = AtomicBool::new(false);
    if CONFIRMING.swap(true, Ordering::SeqCst) {
        return;
    }

    let process_manager = app.state::<ProcessManagerHandle>();
    let has_active = process_manager.0.lock().await.has_tracked();

    if has_active {
        use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

        let (tx, rx) = tokio::sync::oneshot::channel();
        app.dialog()
            .message("Running processes will be stopped. Are you sure you want to quit?")
            .title("Quit Lifecycle")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Quit".to_string(),
                "Cancel".to_string(),
            ))
            .show(move |confirmed| {
                let _ = tx.send(confirmed);
            });

        if !rx.await.unwrap_or(false) {
            CONFIRMING.store(false, Ordering::SeqCst);
            return;
        }
    }

    process_manager.0.lock().await.stop_all().await;

    app.exit(0);
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

#[cfg(target_os = "macos")]
fn disable_main_webview_context_menu(app: &tauri::AppHandle) -> Result<(), LifecycleError> {
    use objc2_app_kit::NSView;
    use std::ffi::c_void;

    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| LifecycleError::AttachFailed("main webview window not found".to_string()))?;

    main_window
        .with_webview(|webview| unsafe {
            let view: &NSView = &*webview.inner().cast();

            extern "C" {
                fn object_getClass(obj: *const c_void) -> *mut c_void;
                fn class_replaceMethod(
                    cls: *mut c_void,
                    name: *const c_void,
                    imp: *const c_void,
                    types: *const u8,
                ) -> *const c_void;
            }

            extern "C" fn no_menu(
                _this: *const c_void,
                _cmd: *const c_void,
                _event: *const c_void,
            ) -> *const c_void {
                std::ptr::null()
            }

            let cls = object_getClass((view as *const NSView).cast());
            let sel = objc2::sel!(menuForEvent:);
            let sel_ptr: *const c_void = std::mem::transmute(sel);
            class_replaceMethod(
                cls,
                sel_ptr,
                no_menu as *const () as *const c_void,
                b"@@:@\0".as_ptr(),
            );
        })
        .map_err(|error| LifecycleError::AttachFailed(error.to_string()))
}

#[cfg(not(target_os = "macos"))]
fn disable_main_webview_context_menu(_app: &tauri::AppHandle) -> Result<(), LifecycleError> {
    Ok(())
}

/// Override `cancelOperation:` on the main NSWindow to suppress the macOS
/// system beep when Escape is pressed. Without this, NSResponder's default
/// implementation calls NSBeep() when no view in the responder chain handles
/// the selector. The DOM keydown event still reaches JavaScript so Escape can
/// be handled in the web layer.
#[cfg(target_os = "macos")]
fn suppress_escape_beep(app: &tauri::AppHandle) -> Result<(), LifecycleError> {
    use objc2_app_kit::{NSView, NSWindow};
    use std::ffi::c_void;

    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| LifecycleError::AttachFailed("main webview window not found".to_string()))?;

    main_window
        .with_webview(|webview| unsafe {
            let view: &NSView = &*webview.inner().cast();
            if let Some(host_window) = view.window() {
                let host_window: &NSWindow = &host_window;

                extern "C" {
                    fn object_getClass(obj: *const c_void) -> *mut c_void;
                    fn class_replaceMethod(
                        cls: *mut c_void,
                        name: *const c_void,
                        imp: *const c_void,
                        types: *const u8,
                    ) -> *const c_void;
                }

                extern "C" fn noop_cancel(
                    _this: *const c_void,
                    _cmd: *const c_void,
                    _sender: *const c_void,
                ) {
                }

                let cls = object_getClass((host_window as *const NSWindow).cast());
                let sel = objc2::sel!(cancelOperation:);
                let sel_ptr: *const c_void = std::mem::transmute(sel);
                class_replaceMethod(
                    cls,
                    sel_ptr,
                    noop_cancel as *const () as *const c_void,
                    b"v@:@\0".as_ptr(),
                );
            }
        })
        .map_err(|error| LifecycleError::AttachFailed(error.to_string()))
}

#[cfg(not(target_os = "macos"))]
fn suppress_escape_beep(_app: &tauri::AppHandle) -> Result<(), LifecycleError> {
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
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum EditMenuItem {
    Copy,
    Cut,
    Paste,
    SelectAll,
    Separator,
}

#[cfg(target_os = "macos")]
const EDIT_MENU_ITEMS: &[EditMenuItem] = &[
    // Undo and Redo are intentionally omitted. Their native macOS
    // accelerators (Cmd+Z / Cmd+Shift+Z) intercept the keydown event
    // before it reaches the webview, preventing CodeMirror's own undo
    // system from working.  The browser handles undo/redo natively for
    // standard input elements, so omitting these menu items is safe.
    EditMenuItem::Cut,
    EditMenuItem::Copy,
    EditMenuItem::Paste,
    EditMenuItem::Separator,
    EditMenuItem::SelectAll,
];

#[cfg(target_os = "macos")]
fn build_edit_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<tauri::menu::Submenu<R>, LifecycleError> {
    use tauri::menu::SubmenuBuilder;

    EDIT_MENU_ITEMS
        .iter()
        .copied()
        .fold(
            SubmenuBuilder::new(app, "Edit"),
            |builder, item| match item {
                EditMenuItem::Separator => builder.separator(),
                EditMenuItem::Cut => builder.cut(),
                EditMenuItem::Copy => builder.copy(),
                EditMenuItem::Paste => builder.paste(),
                EditMenuItem::SelectAll => builder.select_all(),
            },
        )
        .build()
        .map_err(|error| LifecycleError::AttachFailed(format!("failed to build app menu: {error}")))
}

#[cfg(target_os = "macos")]
fn build_app_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<tauri::menu::Menu<R>, LifecycleError> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

    let command_palette_item =
        MenuItemBuilder::with_id(APP_MENU_ITEM_OPEN_COMMAND_PALETTE, "Command Palette...")
            .accelerator("CmdOrCtrl+K")
            .build(app)
            .map_err(|error| {
                LifecycleError::AttachFailed(format!("failed to build app menu: {error}"))
            })?;

    let open_file_item = MenuItemBuilder::with_id(APP_MENU_ITEM_OPEN_FILE_PICKER, "Open File...")
        .accelerator("CmdOrCtrl+P")
        .build(app)
        .map_err(|error| {
            LifecycleError::AttachFailed(format!("failed to build app menu: {error}"))
        })?;

    let settings_item = MenuItemBuilder::with_id(APP_MENU_ITEM_OPEN_SETTINGS, "Settings...")
        .accelerator("CmdOrCtrl+,")
        .build(app)
        .map_err(|error| {
            LifecycleError::AttachFailed(format!("failed to build app menu: {error}"))
        })?;

    let quit_item = MenuItemBuilder::with_id(APP_MENU_ITEM_QUIT, "Quit Lifecycle")
        .accelerator("CmdOrCtrl+Q")
        .build(app)
        .map_err(|error| {
            LifecycleError::AttachFailed(format!("failed to build app menu: {error}"))
        })?;

    let lifecycle_menu = SubmenuBuilder::new(app, "Lifecycle")
        .about(None)
        .separator()
        .item(&command_palette_item)
        .item(&open_file_item)
        .item(&settings_item)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .separator()
        .item(&quit_item)
        .build()
        .map_err(|error| {
            LifecycleError::AttachFailed(format!("failed to build app menu: {error}"))
        })?;

    let edit_menu = build_edit_menu(app)?;

    // Project submenu — populated dynamically via sync_project_menu command.
    let project_menu = SubmenuBuilder::new(app, "Project")
        .build()
        .map_err(|error| {
            LifecycleError::AttachFailed(format!("failed to build project menu: {error}"))
        })?;

    let menu = MenuBuilder::new(app)
        .item(&lifecycle_menu)
        .item(&edit_menu)
        .item(&project_menu)
        .build()
        .map_err(|error| {
            LifecycleError::AttachFailed(format!("failed to build root menu: {error}"))
        })?;

    Ok(menu)
}

#[cfg(target_os = "macos")]
fn setup_app_menu(app: &tauri::AppHandle) -> Result<(), LifecycleError> {
    let menu = build_app_menu(app)?;

    menu.set_as_app_menu().map_err(|error| {
        LifecycleError::AttachFailed(format!("failed to install app menu: {error}"))
    })?;

    Ok(())
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::{EditMenuItem, EDIT_MENU_ITEMS};

    #[test]
    fn app_menu_includes_standard_edit_actions() {
        assert_eq!(
            EDIT_MENU_ITEMS,
            &[
                EditMenuItem::Cut,
                EditMenuItem::Copy,
                EditMenuItem::Paste,
                EditMenuItem::Separator,
                EditMenuItem::SelectAll,
            ]
        );
    }
}
