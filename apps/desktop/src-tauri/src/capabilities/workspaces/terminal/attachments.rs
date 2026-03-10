use std::path::Path;

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

#[cfg(test)]
mod tests {
    use super::{
        build_native_terminal_attachment_paste_payload, build_terminal_attachment_file_name,
        build_terminal_attachment_write_payloads, format_terminal_attachment_insertion,
    };

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
}
