use std::path::Path;

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
