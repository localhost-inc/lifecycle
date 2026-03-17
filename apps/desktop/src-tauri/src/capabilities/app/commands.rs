use crate::shared::errors::LifecycleError;
use serde::Serialize;
use tauri::WebviewWindow;

#[derive(Clone, Copy, Serialize)]
pub struct WindowMousePosition {
    x: f64,
    y: f64,
}

#[tauri::command]
pub async fn get_auth_session() -> Result<crate::platform::auth::AuthSession, LifecycleError> {
    crate::platform::auth::read_auth_session().await
}

#[tauri::command]
pub async fn set_window_accepts_mouse_moved_events(
    window: WebviewWindow,
    enabled: bool,
) -> Result<(), LifecycleError> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSView, NSWindow};

        window
            .with_webview(move |webview| unsafe {
                let view: &NSView = &*webview.inner().cast();
                if let Some(host_window) = view.window() {
                    let host_window: &NSWindow = &host_window;
                    host_window.setAcceptsMouseMovedEvents(enabled);
                }
            })
            .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;
    }

    #[cfg(not(target_os = "macos"))]
    let _ = (&window, enabled);

    Ok(())
}

#[tauri::command]
pub async fn set_window_pointing_cursor(
    window: WebviewWindow,
    pointing: bool,
) -> Result<(), LifecycleError> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSCursor, NSView};

        window
            .with_webview(move |webview| unsafe {
                let view: &NSView = &*webview.inner().cast();
                if view.window().is_some() {
                    let cursor = if pointing {
                        NSCursor::pointingHandCursor()
                    } else {
                        NSCursor::arrowCursor()
                    };
                    cursor.set();
                }
            })
            .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;
    }

    #[cfg(not(target_os = "macos"))]
    let _ = (&window, pointing);

    Ok(())
}

#[tauri::command]
pub async fn get_window_mouse_position(
    window: WebviewWindow,
) -> Result<Option<WindowMousePosition>, LifecycleError> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSView;
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);

        window
            .with_webview(move |webview| unsafe {
                let view: &NSView = &*webview.inner().cast();
                let position = view.window().map(|host_window| {
                    let point = view.convertPoint_fromView(
                        host_window.mouseLocationOutsideOfEventStream(),
                        None,
                    );
                    let bounds = view.bounds();
                    let y = if view.isFlipped() {
                        point.y
                    } else {
                        bounds.size.height - point.y
                    };

                    WindowMousePosition { x: point.x, y }
                });

                let _ = sender.send(position);
            })
            .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;

        return receiver.recv().map_err(|_| {
            LifecycleError::AttachFailed("overlay mouse position did not resolve".to_string())
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = &window;
        Ok(None)
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn sync_project_menu(app: tauri::AppHandle, names: Vec<String>) -> Result<(), String> {
    use crate::APP_MENU_ITEM_SELECT_PROJECT_PREFIX;
    use tauri::menu::{MenuItemBuilder, SubmenuBuilder};

    let menu = app.menu().ok_or("no app menu")?;

    // Find and remove the existing Project submenu.
    let items = menu.items().map_err(|e| e.to_string())?;
    for item in &items {
        if let tauri::menu::MenuItemKind::Submenu(sub) = item {
            if sub.text().map_or(false, |t| t == "Project") {
                let _ = menu.remove(sub);
                break;
            }
        }
    }

    // Build a new Project submenu with the provided names.
    let max_items = names.len().min(9);
    let mut builder = SubmenuBuilder::new(&app, "Project");
    for (i, name) in names.iter().take(max_items).enumerate() {
        let digit = i + 1;
        let item_id = format!("{APP_MENU_ITEM_SELECT_PROJECT_PREFIX}{digit}");
        let item = MenuItemBuilder::with_id(item_id, name.as_str())
            .accelerator(format!("CmdOrCtrl+{digit}"))
            .build(&app)
            .map_err(|e| e.to_string())?;
        builder = builder.item(&item);
    }
    let project_menu = builder.build().map_err(|e| e.to_string())?;
    menu.append(&project_menu).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn sync_project_menu(_names: Vec<String>) -> Result<(), String> {
    Ok(())
}
