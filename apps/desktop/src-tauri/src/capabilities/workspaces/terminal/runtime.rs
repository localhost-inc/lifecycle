use crate::platform::db::DbPath;
use crate::platform::native_terminal::{
    self, NativeTerminalFrame, NativeTerminalSurfaceFrameSyncRequest,
    NativeTerminalSurfaceSyncRequest,
};
use crate::shared::errors::{LifecycleError, TerminalStatus, TerminalType};
use crate::WorkspaceControllerRegistryHandle;
use tauri::{AppHandle, Manager, State, Webview};

use super::super::query::TerminalRecord;
use super::super::rename::TitleOrigin;
use super::events::{emit_terminal_created, emit_terminal_status};
use super::launch::{
    native_terminal_command, resolve_terminal_launch, resolve_terminal_working_directory,
};
use super::native_surface::{
    parse_native_terminal_color_scheme, write_native_terminal_theme_override,
};
use super::persistence::{
    insert_terminal_record, load_terminal_record, load_terminal_workspace_context,
    next_terminal_label, update_terminal_state, workspace_has_interactive_terminal_context,
};
use super::types::{NativeTerminalSurfaceFrameSyncInput, NativeTerminalSurfaceSyncInput};
use crate::capabilities::workspaces::controller::ManagedWorkspaceController;

fn terminal_status(record: &TerminalRecord) -> Result<TerminalStatus, LifecycleError> {
    TerminalStatus::from_str(&record.status)
}

fn require_interactive_workspace_context(
    db_path: &str,
    workspace_id: &str,
    target: &str,
) -> Result<super::persistence::TerminalWorkspaceContext, LifecycleError> {
    let workspace = load_terminal_workspace_context(db_path, workspace_id)?;
    if !workspace_has_interactive_terminal_context(&workspace) {
        return Err(LifecycleError::InvalidStateTransition {
            from: "workspace_inactive".to_string(),
            to: target.to_string(),
        });
    }

    Ok(workspace)
}

async fn lookup_workspace_controller(
    app: &AppHandle,
    workspace_id: &str,
) -> ManagedWorkspaceController {
    let workspace_controllers = app.state::<WorkspaceControllerRegistryHandle>();
    workspace_controllers.get_or_create(workspace_id).await
}

fn require_workspace_terminal(
    db_path: &str,
    workspace_id: &str,
    terminal_id: &str,
) -> Result<TerminalRecord, LifecycleError> {
    let terminal = load_terminal_record(db_path, terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.to_string()))?;
    if terminal.workspace_id != workspace_id {
        return Err(LifecycleError::WorkspaceNotFound(terminal_id.to_string()));
    }

    Ok(terminal)
}

pub(crate) async fn create_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    launch_type: String,
) -> Result<TerminalRecord, LifecycleError> {
    let db = db_path.0.clone();
    let workspace_controllers = app.state::<WorkspaceControllerRegistryHandle>();
    let controller = workspace_controllers.get_or_create(&workspace_id).await;
    let _mutation_guard = controller.acquire_mutation_guard().await?;
    require_interactive_workspace_context(&db, &workspace_id, "terminal_access")?;

    let launch_type = TerminalType::from_str(&launch_type)?;
    resolve_terminal_launch(&launch_type)?;
    if !native_terminal::is_available() {
        return Err(LifecycleError::AttachFailed(
            "native terminal runtime is unavailable".to_string(),
        ));
    }

    let label = next_terminal_label(&db, &workspace_id)?;
    let terminal_id = uuid::Uuid::new_v4().to_string();
    let terminal = insert_terminal_record(
        &db,
        &terminal_id,
        &workspace_id,
        &launch_type,
        &label,
        TitleOrigin::Default,
        TerminalStatus::Detached,
    )?;

    emit_terminal_created(&app, &terminal);
    Ok(terminal)
}

pub(crate) async fn sync_native_terminal_surface(
    webview: Webview,
    db_path: State<'_, DbPath>,
    input: NativeTerminalSurfaceSyncInput,
) -> Result<(), LifecycleError> {
    if !native_terminal::is_available() {
        return Err(LifecycleError::AttachFailed(
            "native terminal runtime is unavailable".to_string(),
        ));
    }

    let db = db_path.0.clone();
    let terminal = load_terminal_record(&db, &input.terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(input.terminal_id.clone()))?;
    if matches!(
        terminal_status(&terminal)?,
        TerminalStatus::Finished | TerminalStatus::Failed
    ) {
        native_terminal::hide_surface(webview.app_handle(), &input.terminal_id)?;
        return Ok(());
    }

    let workspace =
        require_interactive_workspace_context(&db, &terminal.workspace_id, "terminal_access")?;
    let controller =
        lookup_workspace_controller(webview.app_handle(), &terminal.workspace_id).await;
    let _mutation_guard = controller.acquire_mutation_guard().await?;
    let launch_type = TerminalType::from_str(&terminal.launch_type)?;
    let launch = resolve_terminal_launch(&launch_type)?;
    let theme_override_path =
        write_native_terminal_theme_override(&input.theme, &input.font_family)?;
    let color_scheme = parse_native_terminal_color_scheme(&input.appearance)?;
    let command_line = native_terminal_command(&launch_type, &launch, &[]);
    let terminal_id_for_surface = input.terminal_id.clone();
    let theme_override_path = theme_override_path.to_string_lossy().to_string();
    let working_directory = resolve_terminal_working_directory(&workspace)?;

    native_terminal::sync_surface(
        &webview,
        NativeTerminalSurfaceSyncRequest {
            background_color: &input.theme.background,
            color_scheme,
            command: &command_line,
            focused: input.focused,
            font_size: input.font_size,
            frame: NativeTerminalFrame {
                x: input.x,
                y: input.y,
                width: input.width,
                height: input.height,
            },
            opacity: input.opacity,
            pointer_passthrough: input.pointer_passthrough,
            scale_factor: input.scale_factor,
            terminal_id: &terminal_id_for_surface,
            theme_config_path: &theme_override_path,
            visible: input.visible,
            working_directory: &working_directory,
        },
    )?;

    let target_status = if input.visible {
        TerminalStatus::Active
    } else {
        TerminalStatus::Detached
    };
    if terminal.status != target_status.as_str() {
        let terminal =
            update_terminal_state(&db, &input.terminal_id, target_status, None, None, false)?;
        emit_terminal_status(webview.app_handle(), &terminal);
    }

    Ok(())
}

pub(crate) async fn sync_native_terminal_surface_frame(
    webview: Webview,
    input: NativeTerminalSurfaceFrameSyncInput,
) -> Result<(), LifecycleError> {
    if !native_terminal::is_available() {
        return Ok(());
    }

    native_terminal::sync_surface_frame(
        &webview,
        NativeTerminalSurfaceFrameSyncRequest {
            frame: NativeTerminalFrame {
                x: input.x,
                y: input.y,
                width: input.width,
                height: input.height,
            },
            terminal_id: &input.terminal_id,
        },
    )?;

    Ok(())
}

pub(crate) async fn hide_native_terminal_surface(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    if !native_terminal::is_available() {
        return Ok(());
    }

    let terminal_id_for_surface = terminal_id.clone();
    native_terminal::hide_surface(&app, &terminal_id_for_surface)?;
    let db = db_path.0.clone();
    let Some(terminal) = load_terminal_record(&db, &terminal_id)? else {
        return Ok(());
    };
    if matches!(terminal_status(&terminal)?, TerminalStatus::Active) {
        let terminal = update_terminal_state(
            &db,
            &terminal_id,
            TerminalStatus::Detached,
            None,
            None,
            false,
        )?;
        emit_terminal_status(&app, &terminal);
    }

    Ok(())
}

pub(crate) async fn detach_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    require_workspace_terminal(&db_path.0, &workspace_id, &terminal_id)?;
    hide_native_terminal_surface(app, db_path, terminal_id).await
}

pub(crate) async fn kill_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    let db = db_path.0.clone();
    let terminal = require_workspace_terminal(&db, &workspace_id, &terminal_id)?;
    let controller = lookup_workspace_controller(&app, &workspace_id).await;
    let _mutation_guard = controller.acquire_mutation_guard().await?;
    let terminal_id_for_surface = terminal_id.clone();
    native_terminal::destroy_surface(&app, &terminal_id_for_surface)?;
    if !matches!(
        terminal_status(&terminal)?,
        TerminalStatus::Finished | TerminalStatus::Failed
    ) {
        let terminal = update_terminal_state(
            &db,
            &terminal_id,
            TerminalStatus::Finished,
            None,
            Some(130),
            true,
        )?;
        emit_terminal_status(&app, &terminal);
    }

    Ok(())
}

pub(crate) async fn interrupt_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    require_workspace_terminal(&db_path.0, &workspace_id, &terminal_id)?;
    native_terminal::send_text(&app, &terminal_id, "\x03")
}

pub(crate) async fn send_terminal_text(
    app: AppHandle,
    terminal_id: String,
    text: String,
) -> Result<(), LifecycleError> {
    if text.is_empty() {
        return Ok(());
    }

    native_terminal::send_text(&app, &terminal_id, &text)
}

#[allow(dead_code)]
pub(crate) fn complete_native_terminal_exit(
    app: &AppHandle,
    db_path: &str,
    terminal_id: &str,
    exit_code: i64,
) -> Result<(), LifecycleError> {
    let Some(terminal) = load_terminal_record(db_path, terminal_id)? else {
        return Ok(());
    };

    if matches!(
        terminal_status(&terminal)?,
        TerminalStatus::Finished | TerminalStatus::Failed
    ) {
        return Ok(());
    }

    let terminal = update_terminal_state(
        db_path,
        terminal_id,
        TerminalStatus::Finished,
        None,
        Some(exit_code),
        true,
    )?;
    emit_terminal_status(app, &terminal);
    Ok(())
}
