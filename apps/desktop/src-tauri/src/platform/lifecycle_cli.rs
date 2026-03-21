use crate::shared::errors::LifecycleError;
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const DEV_CLI_ENTRY_RELATIVE_PATH: &str = "packages/cli/src/index.ts";
const DEV_CLI_SHIM_FILE_NAME: &str = "lifecycle";
const BUNDLED_CLI_RESOURCE_CANDIDATES: &[&str] = &["lifecycle", "resources/lifecycle"];
const WIRED_COMMANDS: &[&str] = &[
    "lifecycle context",
    "lifecycle service list",
    "lifecycle service info <service>",
    "lifecycle service start [service...]",
    "lifecycle tab open --surface browser --url <url>",
];

#[derive(Clone, Debug)]
pub(crate) struct LifecycleCliState {
    binary_path: Option<String>,
    path_value: Option<String>,
}

impl LifecycleCliState {
    pub(crate) fn initialize(app: &AppHandle) -> Result<Self, LifecycleError> {
        let binary_path = resolve_cli_binary_path(app)?;
        let path_value = match binary_path.as_deref() {
            Some(path) => {
                let binary_path = PathBuf::from(path);
                let parent = binary_path.parent().ok_or_else(|| {
                    LifecycleError::AttachFailed(format!(
                        "lifecycle CLI path has no parent directory: {path}"
                    ))
                })?;
                let current_path = std::env::var("PATH").unwrap_or_default();
                let path_value = prepend_path_value(&current_path, parent);
                std::env::set_var("LIFECYCLE_CLI_PATH", path);
                std::env::set_var("PATH", &path_value);
                Some(path_value)
            }
            None => None,
        };

        Ok(Self {
            binary_path,
            path_value,
        })
    }

    pub(crate) fn disabled() -> Self {
        Self {
            binary_path: None,
            path_value: None,
        }
    }

    pub(crate) fn binary_path(&self) -> Option<&str> {
        self.binary_path.as_deref()
    }

    pub(crate) fn path_value(&self) -> Option<&str> {
        self.path_value.as_deref()
    }

    pub(crate) fn render_agent_instructions(&self) -> String {
        let mut lines = vec![
            "You are running inside Lifecycle Desktop on behalf of the user.".to_string(),
            "Run `lifecycle context` first in every new session.".to_string(),
            "Prefer Lifecycle CLI commands over ad hoc shell flows when Lifecycle already provides the capability.".to_string(),
            "Use Lifecycle for service readiness and desktop surface control before inventing alternate paths.".to_string(),
        ];

        if let Some(path) = self.binary_path() {
            lines.push(format!("Lifecycle CLI path: `{path}`."));
        } else {
            lines.push(
                "Lifecycle CLI is expected to be installed for this session; if `lifecycle` is missing, report that explicitly.".to_string(),
            );
        }

        lines.push("Currently wired Lifecycle commands:".to_string());
        lines.extend(WIRED_COMMANDS.iter().map(|command| format!("- {command}")));
        lines.push(
            "Not wired yet: `lifecycle browser reload`, `lifecycle browser snapshot`, and non-browser `lifecycle tab open` surfaces.".to_string(),
        );

        lines.join("\n")
    }
}

pub(crate) fn wired_commands() -> &'static [&'static str] {
    WIRED_COMMANDS
}

pub(crate) fn resolve_cli_binary_path(app: &AppHandle) -> Result<Option<String>, LifecycleError> {
    if let Some(path) = std::env::var_os("LIFECYCLE_CLI_PATH").map(PathBuf::from) {
        if path.exists() {
            return Ok(Some(path.to_string_lossy().to_string()));
        }
    }

    if let Some(path) = resolve_dev_cli_shim_path(app)? {
        return Ok(Some(path.to_string_lossy().to_string()));
    }

    if let Some(path) = resolve_bundled_cli_path(app)? {
        return Ok(Some(path.to_string_lossy().to_string()));
    }

    Ok(None)
}

fn resolve_dev_cli_shim_path(app: &AppHandle) -> Result<Option<PathBuf>, LifecycleError> {
    let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
    if !repo_root.exists() {
        return Ok(None);
    }

    let repo_root = repo_root.canonicalize().map_err(|error| {
        LifecycleError::AttachFailed(format!(
            "failed to resolve repo root for Lifecycle CLI shim: {error}"
        ))
    })?;
    let cli_entry = repo_root.join(DEV_CLI_ENTRY_RELATIVE_PATH);
    if !cli_entry.exists() {
        return Ok(None);
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;
    let bin_dir = app_data_dir.join("bin");
    fs::create_dir_all(&bin_dir).map_err(map_filesystem_error)?;
    let shim_path = bin_dir.join(DEV_CLI_SHIM_FILE_NAME);
    let script = build_dev_cli_shim_script(&cli_entry);
    if fs::read_to_string(&shim_path).ok().as_deref() != Some(script.as_str()) {
        fs::write(&shim_path, script).map_err(map_filesystem_error)?;
    }
    set_executable_permissions(&shim_path)?;

    Ok(Some(shim_path))
}

fn resolve_bundled_cli_path(app: &AppHandle) -> Result<Option<PathBuf>, LifecycleError> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;

    for candidate in resource_candidates() {
        let candidate_path = resource_dir.join(candidate);
        if candidate_path.exists() {
            return Ok(Some(candidate_path));
        }
    }

    Ok(None)
}

fn resource_candidates() -> Vec<&'static str> {
    #[cfg(target_os = "windows")]
    {
        vec!["lifecycle.exe", "resources/lifecycle.exe"]
    }

    #[cfg(not(target_os = "windows"))]
    {
        BUNDLED_CLI_RESOURCE_CANDIDATES.to_vec()
    }
}

fn build_dev_cli_shim_script(cli_entry: &Path) -> String {
    format!(
        "#!/bin/sh\nexec bun {} \"$@\"\n",
        shell_quote(&cli_entry.to_string_lossy())
    )
}

fn shell_quote(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }

    if value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '/' | '-' | '_' | '.' | ':'))
    {
        return value.to_string();
    }

    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn prepend_path_value(existing: &str, entry: &Path) -> String {
    let entry = entry.to_string_lossy().to_string();
    if existing
        .split(':')
        .any(|current| !current.is_empty() && current == entry)
    {
        return existing.to_string();
    }

    if existing.is_empty() {
        return entry;
    }

    format!("{entry}:{existing}")
}

fn set_executable_permissions(path: &Path) -> Result<(), LifecycleError> {
    #[cfg(unix)]
    {
        let mut permissions = fs::metadata(path)
            .map_err(map_filesystem_error)?
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).map_err(map_filesystem_error)?;
    }

    Ok(())
}

fn map_filesystem_error(error: std::io::Error) -> LifecycleError {
    LifecycleError::AttachFailed(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{build_dev_cli_shim_script, prepend_path_value, wired_commands};
    use std::path::Path;

    #[test]
    fn build_dev_cli_shim_script_execs_bun_with_cli_entry() {
        let script = build_dev_cli_shim_script(Path::new("/tmp/repo/packages/cli/src/index.ts"));
        assert!(script.starts_with("#!/bin/sh\nexec bun "));
        assert!(script.contains("/tmp/repo/packages/cli/src/index.ts"));
        assert!(script.ends_with("\"$@\"\n"));
    }

    #[test]
    fn prepend_path_entry_adds_entry_at_front_once() {
        assert_eq!(
            prepend_path_value("/usr/bin:/bin", Path::new("/tmp/lifecycle/bin")),
            "/tmp/lifecycle/bin:/usr/bin:/bin"
        );
        assert_eq!(
            prepend_path_value(
                "/tmp/lifecycle/bin:/usr/bin:/bin",
                Path::new("/tmp/lifecycle/bin"),
            ),
            "/tmp/lifecycle/bin:/usr/bin:/bin"
        );
    }

    #[test]
    fn wired_commands_expose_current_agent_surface() {
        assert!(wired_commands().contains(&"lifecycle context"));
        assert!(wired_commands().contains(&"lifecycle service list"));
        assert!(wired_commands().contains(&"lifecycle tab open --surface browser --url <url>"));
    }
}
