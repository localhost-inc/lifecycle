use crate::shared::errors::LifecycleError;
use serde::Serialize;
use tauri::WebviewWindow;

#[derive(Clone, Copy, Serialize)]
pub struct WindowMousePosition {
    x: f64,
    y: f64,
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
