use crate::platform::db::DbPath;
use crate::platform::native_terminal::{
    self, NativeTerminalFrame, NativeTerminalSurfaceFrameSyncRequest,
    NativeTerminalSurfaceSyncRequest,
};
use crate::shared::errors::{LifecycleError, TerminalFailureReason, TerminalStatus, TerminalType};
use crate::WorkspaceControllerRegistryHandle;
use tauri::{AppHandle, Manager, State, WebviewWindow};

use super::super::query::TerminalRecord;
use super::super::rename::TitleOrigin;
use super::events::{emit_terminal_created, emit_terminal_status};
use super::harness_binding::{prepare_harness_terminal, resolve_harness_launch_environment};
use super::harness_observer::maybe_schedule_harness_observers;
use super::launch::{
    native_terminal_command, resolve_terminal_launch, resolve_terminal_working_directory,
    HarnessLaunchMode,
};
use super::native_surface::{
    parse_native_terminal_color_scheme, write_native_terminal_theme_override,
};
use super::persistence::{
    insert_terminal_record, load_terminal_harness_launch_config, load_terminal_record,
    load_workspace_runtime, next_terminal_label, update_terminal_state,
    workspace_has_interactive_terminal_context,
};
use super::types::{NativeTerminalSurfaceFrameSyncInput, NativeTerminalSurfaceSyncInput};
use crate::capabilities::workspaces::controller::ManagedWorkspaceController;
use crate::capabilities::workspaces::harness::HarnessLaunchConfig;

fn terminal_status(record: &TerminalRecord) -> Result<TerminalStatus, LifecycleError> {
    TerminalStatus::from_str(&record.status)
}

fn require_interactive_workspace_runtime(
    db_path: &str,
    workspace_id: &str,
    target: &str,
) -> Result<super::persistence::WorkspaceRuntime, LifecycleError> {
    let workspace = load_workspace_runtime(db_path, workspace_id)?;
    if !workspace_has_interactive_terminal_context(&workspace) {
        return Err(LifecycleError::InvalidStateTransition {
            from: workspace.status.as_str().to_string(),
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

pub(crate) async fn create_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    launch_type: String,
    harness_provider: Option<String>,
    harness_session_id: Option<String>,
    harness_launch_config: Option<HarnessLaunchConfig>,
) -> Result<TerminalRecord, LifecycleError> {
    let db = db_path.0.clone();
    let workspace_controllers = app.state::<WorkspaceControllerRegistryHandle>();
    let controller = workspace_controllers.get_or_create(&workspace_id).await;
    let _mutation_guard = controller.acquire_mutation_guard().await?;
    require_interactive_workspace_runtime(&db, &workspace_id, "terminal_access")?;

    let launch_type = TerminalType::from_str(&launch_type)?;
    let label = next_terminal_label(
        &db,
        &workspace_id,
        &launch_type,
        harness_provider.as_deref(),
    )?;
    let terminal_id = uuid::Uuid::new_v4().to_string();
    let prepared_harness_terminal = prepare_harness_terminal(
        &app,
        &terminal_id,
        &launch_type,
        harness_provider.as_deref(),
        harness_session_id.as_deref(),
    )?;
    resolve_terminal_launch(
        &launch_type,
        harness_provider.as_deref(),
        prepared_harness_terminal.harness_session_id.as_deref(),
        prepared_harness_terminal.harness_launch_mode,
        harness_launch_config.as_ref(),
    )?;

    if !native_terminal::is_available() {
        return Err(LifecycleError::AttachFailed(
            "native terminal runtime is unavailable".to_string(),
        ));
    }

    let terminal = insert_terminal_record(
        &db,
        &terminal_id,
        &workspace_id,
        &launch_type,
        harness_provider.as_deref(),
        prepared_harness_terminal.harness_session_id.as_deref(),
        prepared_harness_terminal.harness_launch_mode,
        harness_launch_config.as_ref(),
        &label,
        TitleOrigin::Default,
        TerminalStatus::Detached,
    )?;

    emit_terminal_created(&app, &terminal);
    Ok(terminal)
}

pub(crate) async fn sync_native_terminal_surface(
    window: WebviewWindow,
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
        native_terminal::hide_surface(window.app_handle(), &input.terminal_id)?;
        return Ok(());
    }

    let workspace =
        require_interactive_workspace_runtime(&db, &terminal.workspace_id, "terminal_access")?;
    let controller = lookup_workspace_controller(window.app_handle(), &terminal.workspace_id).await;
    let _mutation_guard = controller.acquire_mutation_guard().await?;
    let launch_type = TerminalType::from_str(&terminal.launch_type)?;
    let harness_launch_mode = HarnessLaunchMode::from_str(&terminal.harness_launch_mode)?;
    let harness_launch_config = load_terminal_harness_launch_config(&db, &terminal.id)?;
    let launch = resolve_terminal_launch(
        &launch_type,
        terminal.harness_provider.as_deref(),
        terminal.harness_session_id.as_deref(),
        harness_launch_mode,
        harness_launch_config.as_ref(),
    )?;
    let launch_environment = resolve_harness_launch_environment(&window.app_handle(), &terminal)?;
    let theme_override_path =
        write_native_terminal_theme_override(&input.theme, &input.font_family)?;
    let color_scheme = parse_native_terminal_color_scheme(&input.appearance)?;
    let command_line = native_terminal_command(&launch_type, &launch, &launch_environment);
    let terminal_id_for_surface = input.terminal_id.clone();
    let theme_override_path = theme_override_path.to_string_lossy().to_string();
    let working_directory = resolve_terminal_working_directory(&workspace)?;
    native_terminal::sync_surface(
        &window,
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
    maybe_schedule_harness_observers(window.app_handle(), &db, &terminal, &working_directory);

    let target_status = if input.visible {
        TerminalStatus::Active
    } else {
        TerminalStatus::Detached
    };
    if terminal.status != target_status.as_str() {
        let terminal =
            update_terminal_state(&db, &input.terminal_id, target_status, None, None, false)?;
        emit_terminal_status(window.app_handle(), &terminal);
    }

    Ok(())
}

pub(crate) async fn sync_native_terminal_surface_frame(
    window: WebviewWindow,
    input: NativeTerminalSurfaceFrameSyncInput,
) -> Result<(), LifecycleError> {
    if !native_terminal::is_available() {
        return Ok(());
    }

    native_terminal::sync_surface_frame(
        &window,
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
    terminal_id: String,
) -> Result<(), LifecycleError> {
    hide_native_terminal_surface(app, db_path, terminal_id).await
}

pub(crate) async fn kill_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    let db = db_path.0.clone();
    if let Some(terminal) = load_terminal_record(&db, &terminal_id)? {
        let controller = lookup_workspace_controller(&app, &terminal.workspace_id).await;
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
    } else {
        let terminal_id_for_surface = terminal_id.clone();
        native_terminal::destroy_surface(&app, &terminal_id_for_surface)?;
    }

    Ok(())
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

    let launch_type = TerminalType::from_str(&terminal.launch_type)?;
    let harness_launch_config = load_terminal_harness_launch_config(db_path, terminal_id)?;
    let launch = resolve_terminal_launch(
        &launch_type,
        terminal.harness_provider.as_deref(),
        terminal.harness_session_id.as_deref(),
        HarnessLaunchMode::from_str(&terminal.harness_launch_mode)?,
        harness_launch_config.as_ref(),
    )?;
    let (status, failure_reason) = if exit_code == 0 {
        (TerminalStatus::Finished, None)
    } else if launch.treat_nonzero_as_failure {
        (
            TerminalStatus::Failed,
            Some(TerminalFailureReason::HarnessProcessExitNonzero),
        )
    } else {
        (TerminalStatus::Finished, None)
    };

    let terminal = update_terminal_state(
        db_path,
        terminal_id,
        status,
        failure_reason.as_ref(),
        Some(exit_code),
        true,
    )?;
    emit_terminal_status(app, &terminal);
    Ok(())
}
