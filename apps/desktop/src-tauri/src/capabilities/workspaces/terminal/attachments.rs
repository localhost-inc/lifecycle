use crate::platform::db::DbPath;
use crate::platform::lifecycle_root::resolve_lifecycle_root;
use crate::shared::errors::LifecycleError;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::path::{Path, PathBuf};
use tauri::State;

use super::persistence::{
    load_terminal_record, load_workspace_runtime, workspace_has_interactive_terminal_context,
};
use super::types::SavedTerminalAttachment;

#[cfg(test)]
const BRACKETED_PASTE_START: &str = "\u{1b}[200~";
#[cfg(test)]
const BRACKETED_PASTE_END: &str = "\u{1b}[201~";

pub(crate) fn build_terminal_attachment_file_name(
    file_name: &str,
    media_type: Option<&str>,
) -> String {
    let stem = sanitize_attachment_stem(
        Path::new(file_name)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("pasted-image"),
    );
    let extension = infer_attachment_extension(file_name, media_type);
    let unique_id = uuid::Uuid::new_v4().simple().to_string();
    format!("{stem}-{}.{}", &unique_id[..8], extension)
}

fn sanitize_attachment_stem(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    let trimmed = sanitized.trim_matches('-');
    if trimmed.is_empty() {
        "pasted-image".to_string()
    } else {
        trimmed.to_string()
    }
}

fn infer_attachment_extension(file_name: &str, media_type: Option<&str>) -> &'static str {
    if let Some(extension) = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
    {
        return match extension.to_ascii_lowercase().as_str() {
            "avif" => "avif",
            "bmp" => "bmp",
            "gif" => "gif",
            "heic" => "heic",
            "heif" => "heif",
            "jpeg" | "jpg" => "jpg",
            "png" => "png",
            "svg" | "svgz" => "svg",
            "tif" | "tiff" => "tiff",
            "webp" => "webp",
            _ => infer_attachment_extension_from_media_type(media_type),
        };
    }

    infer_attachment_extension_from_media_type(media_type)
}

fn infer_attachment_extension_from_media_type(media_type: Option<&str>) -> &'static str {
    match media_type.map(str::trim).unwrap_or_default() {
        "image/avif" => "avif",
        "image/bmp" => "bmp",
        "image/gif" => "gif",
        "image/heic" => "heic",
        "image/heif" => "heif",
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/svg+xml" => "svg",
        "image/tiff" => "tiff",
        "image/webp" => "webp",
        _ => "png",
    }
}

pub(crate) fn format_terminal_attachment_insertion(paths: &[String]) -> String {
    paths
        .iter()
        .map(|path| serde_json::to_string(path).unwrap_or_else(|_| "\"\"".to_string()))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
pub(crate) fn build_terminal_attachment_write_payloads(
    harness_provider: Option<&str>,
    paths: &[String],
) -> Vec<String> {
    if paths.is_empty() {
        return Vec::new();
    }

    if matches!(harness_provider, Some("codex")) {
        return paths
            .iter()
            .map(|path| {
                format!(
                    "{BRACKETED_PASTE_START}{}{BRACKETED_PASTE_END}",
                    serde_json::to_string(path).unwrap_or_else(|_| "\"\"".to_string())
                )
            })
            .collect();
    }

    vec![format!("{} ", format_terminal_attachment_insertion(paths))]
}

pub(crate) fn build_native_terminal_attachment_paste_payload(
    harness_provider: Option<&str>,
    paths: &[String],
) -> String {
    if paths.is_empty() {
        return String::new();
    }

    let insertion = format_terminal_attachment_insertion(paths);
    if matches!(harness_provider, Some("codex")) {
        insertion
    } else {
        format!("{insertion} ")
    }
}

fn persist_terminal_attachment_bytes(
    db_path: &str,
    workspace_id: &str,
    file_name: &str,
    media_type: Option<&str>,
    bytes: &[u8],
) -> Result<SavedTerminalAttachment, LifecycleError> {
    let workspace = load_workspace_runtime(db_path, workspace_id)?;
    if !workspace_has_interactive_terminal_context(&workspace) {
        return Err(LifecycleError::InvalidStateTransition {
            from: workspace.status.as_str().to_string(),
            to: "terminal_attachment".to_string(),
        });
    }

    let attachment_dir = terminal_attachment_dir(workspace_id)?;
    std::fs::create_dir_all(&attachment_dir).map_err(|error| {
        LifecycleError::AttachmentPersistenceFailed(format!(
            "failed to create attachment directory: {error}"
        ))
    })?;

    let stored_file_name = build_terminal_attachment_file_name(file_name, media_type);
    let attachment_path = attachment_dir.join(&stored_file_name);
    std::fs::write(&attachment_path, bytes).map_err(|error| {
        LifecycleError::AttachmentPersistenceFailed(format!(
            "failed to persist attachment: {error}"
        ))
    })?;

    Ok(SavedTerminalAttachment {
        absolute_path: attachment_path.to_string_lossy().to_string(),
        file_name: stored_file_name.clone(),
        relative_path: format!("attachments/{workspace_id}/{stored_file_name}"),
    })
}

fn terminal_attachment_dir_for_root(lifecycle_root_dir: &Path, workspace_id: &str) -> PathBuf {
    lifecycle_root_dir.join("attachments").join(workspace_id)
}

fn terminal_attachment_dir(workspace_id: &str) -> Result<PathBuf, LifecycleError> {
    let lifecycle_root_dir = resolve_lifecycle_root().map_err(|error| {
        LifecycleError::AttachmentPersistenceFailed(format!(
            "failed to resolve Lifecycle root: {error}"
        ))
    })?;
    Ok(terminal_attachment_dir_for_root(
        &lifecycle_root_dir,
        workspace_id,
    ))
}

pub(crate) async fn save_terminal_attachment(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    file_name: String,
    media_type: Option<String>,
    base64_data: String,
) -> Result<SavedTerminalAttachment, LifecycleError> {
    let bytes = STANDARD
        .decode(base64_data)
        .map_err(|error| LifecycleError::AttachmentPersistenceFailed(error.to_string()))?;
    persist_terminal_attachment_bytes(
        &db_path.0,
        &workspace_id,
        &file_name,
        media_type.as_deref(),
        &bytes,
    )
}

pub(crate) fn prepare_native_terminal_attachment_paste(
    db_path: &str,
    terminal_id: &str,
    file_name: &str,
    media_type: Option<&str>,
    bytes: &[u8],
) -> Result<String, LifecycleError> {
    let terminal = load_terminal_record(db_path, terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.to_string()))?;
    let attachment = persist_terminal_attachment_bytes(
        db_path,
        &terminal.workspace_id,
        file_name,
        media_type,
        bytes,
    )?;
    Ok(build_native_terminal_attachment_paste_payload(
        terminal.harness_provider.as_deref(),
        &[attachment.absolute_path],
    ))
}

#[cfg(test)]
mod tests {
    use super::{
        build_native_terminal_attachment_paste_payload, build_terminal_attachment_file_name,
        build_terminal_attachment_write_payloads, format_terminal_attachment_insertion,
        terminal_attachment_dir_for_root,
    };
    use std::path::{Path, PathBuf};

    #[test]
    fn build_terminal_attachment_file_name_sanitizes_the_stem() {
        let file_name = build_terminal_attachment_file_name(
            "Screenshot 2026-03-06 11.22.33.PNG",
            Some("image/png"),
        );

        assert!(file_name.starts_with("screenshot-2026-03-06-11-22-33-"));
        assert!(file_name.ends_with(".png"));
    }

    #[test]
    fn build_terminal_attachment_file_name_infers_extension_from_media_type() {
        let file_name = build_terminal_attachment_file_name("clipboard-image", Some("image/webp"));

        assert!(file_name.starts_with("clipboard-image-"));
        assert!(file_name.ends_with(".webp"));
    }

    #[test]
    fn format_terminal_attachment_insertion_quotes_each_path() {
        assert_eq!(
            format_terminal_attachment_insertion(&[
                "/tmp/one.png".to_string(),
                "/tmp/two with spaces.png".to_string(),
            ]),
            r#""/tmp/one.png" "/tmp/two with spaces.png""#
        );
    }

    #[test]
    fn build_terminal_attachment_write_payloads_uses_plain_text_for_non_codex() {
        assert_eq!(
            build_terminal_attachment_write_payloads(
                Some("claude"),
                &[
                    "/tmp/one.png".to_string(),
                    "/tmp/two with spaces.png".to_string(),
                ],
            ),
            vec![r#""/tmp/one.png" "/tmp/two with spaces.png" "#.to_string()]
        );
    }

    #[test]
    fn build_terminal_attachment_write_payloads_uses_bracketed_paste_for_codex() {
        assert_eq!(
            build_terminal_attachment_write_payloads(
                Some("codex"),
                &[
                    "/tmp/one.png".to_string(),
                    "/tmp/two with spaces.png".to_string(),
                ],
            ),
            vec![
                "\u{1b}[200~\"/tmp/one.png\"\u{1b}[201~".to_string(),
                "\u{1b}[200~\"/tmp/two with spaces.png\"\u{1b}[201~".to_string(),
            ]
        );
    }

    #[test]
    fn build_native_terminal_attachment_paste_payload_uses_plain_paste_for_codex() {
        assert_eq!(
            build_native_terminal_attachment_paste_payload(
                Some("codex"),
                &[
                    "/tmp/one.png".to_string(),
                    "/tmp/two with spaces.png".to_string(),
                ],
            ),
            r#""/tmp/one.png" "/tmp/two with spaces.png""#
        );
    }

    #[test]
    fn build_native_terminal_attachment_paste_payload_keeps_trailing_space_for_claude() {
        assert_eq!(
            build_native_terminal_attachment_paste_payload(
                Some("claude"),
                &["/tmp/one.png".to_string()],
            ),
            r#""/tmp/one.png" "#
        );
    }

    #[test]
    fn terminal_attachment_dir_uses_lifecycle_root_storage() {
        let path =
            terminal_attachment_dir_for_root(Path::new("/tmp/lifecycle-root"), "workspace-123");

        assert_eq!(
            path,
            PathBuf::from("/tmp/lifecycle-root/attachments/workspace-123")
        );
    }
}
