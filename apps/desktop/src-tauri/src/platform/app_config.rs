use crate::platform::lifecycle_root::resolve_lifecycle_root;
use crate::shared::errors::LifecycleError;
use std::path::{Path, PathBuf};

pub struct AppConfigPath(pub PathBuf);

pub fn resolve_config_path() -> Result<PathBuf, LifecycleError> {
    Ok(resolve_lifecycle_root()?.join("settings.json"))
}

pub fn read_config(path: &Path) -> Result<serde_json::Value, LifecycleError> {
    match std::fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents).map_err(|error| {
            LifecycleError::Io(format!("failed to parse {}: {error}", path.display()))
        }),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(serde_json::Value::Object(serde_json::Map::new()))
        }
        Err(error) => Err(LifecycleError::Io(format!(
            "failed to read {}: {error}",
            path.display()
        ))),
    }
}

pub fn write_config(path: &Path, value: &serde_json::Value) -> Result<(), LifecycleError> {
    let json = serde_json::to_string_pretty(value)
        .map_err(|error| LifecycleError::Io(format!("failed to serialize config: {error}")))?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            LifecycleError::Io(format!(
                "failed to create config directory {}: {error}",
                parent.display()
            ))
        })?;
    }

    let tmp_path = path.with_extension("json.tmp");
    std::fs::write(&tmp_path, format!("{json}\n")).map_err(|error| {
        LifecycleError::Io(format!("failed to write {}: {error}", tmp_path.display()))
    })?;

    std::fs::rename(&tmp_path, path).map_err(|error| {
        let _ = std::fs::remove_file(&tmp_path);
        LifecycleError::Io(format!(
            "failed to rename {} to {}: {error}",
            tmp_path.display(),
            path.display()
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_config_path() -> PathBuf {
        std::env::temp_dir().join(format!(
            "lifecycle-config-test-{}.json",
            uuid::Uuid::new_v4()
        ))
    }

    #[test]
    fn read_config_returns_empty_object_when_file_missing() {
        let path = temp_config_path();
        let config = read_config(&path).expect("read missing config");
        assert_eq!(config, serde_json::json!({}));
    }

    #[test]
    fn read_config_returns_parsed_json() {
        let path = temp_config_path();
        std::fs::write(&path, r#"{"theme": "light"}"#).expect("write test config");

        let config = read_config(&path).expect("read config");
        assert_eq!(config, serde_json::json!({"theme": "light"}));

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn read_config_returns_error_for_malformed_json() {
        let path = temp_config_path();
        std::fs::write(&path, "not json{").expect("write bad config");

        let result = read_config(&path);
        assert!(result.is_err());

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn write_config_creates_file_with_pretty_json() {
        let path = temp_config_path();
        let value = serde_json::json!({"theme": "dark", "worktreeRoot": "~/.lifecycle/worktrees"});

        write_config(&path, &value).expect("write config");

        let contents = std::fs::read_to_string(&path).expect("read back");
        assert!(contents.ends_with('\n'));
        assert!(contents.contains("  \"theme\": \"dark\""));

        let parsed: serde_json::Value = serde_json::from_str(&contents).expect("parse back");
        assert_eq!(parsed, value);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn write_config_is_idempotent() {
        let path = temp_config_path();
        let value = serde_json::json!({"theme": "light"});

        write_config(&path, &value).expect("first write");
        let first = std::fs::read_to_string(&path).expect("first read");

        write_config(&path, &value).expect("second write");
        let second = std::fs::read_to_string(&path).expect("second read");

        assert_eq!(first, second);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn write_config_cleans_up_temp_file_on_success() {
        let path = temp_config_path();
        let tmp_path = path.with_extension("json.tmp");

        write_config(&path, &serde_json::json!({})).expect("write config");

        assert!(path.exists());
        assert!(!tmp_path.exists());

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn round_trip_preserves_unknown_fields() {
        let path = temp_config_path();
        let value = serde_json::json!({
            "theme": "dark",
            "customUserField": 42,
            "nested": {"a": true}
        });

        write_config(&path, &value).expect("write");
        let read_back = read_config(&path).expect("read");
        assert_eq!(read_back, value);

        let _ = std::fs::remove_file(&path);
    }
}
