use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const LOGIN_SHELL_CAPTURE_TIMEOUT: Duration = Duration::from_secs(3);
const LOGIN_SHELL_CAPTURE_POLL_INTERVAL: Duration = Duration::from_millis(25);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HydratedShellEnvironment {
    pub imported_keys: usize,
    pub path_changed: bool,
    pub shell_path: String,
    pub skipped_keys: usize,
}

pub fn hydrate_process_environment() -> Result<HydratedShellEnvironment, String> {
    #[cfg(not(target_os = "macos"))]
    {
        return Ok(HydratedShellEnvironment {
            imported_keys: 0,
            path_changed: false,
            shell_path: String::new(),
            skipped_keys: 0,
        });
    }

    #[cfg(target_os = "macos")]
    {
        let shell_path = resolve_shell_path();
        let marker = format!("__LIFECYCLE_ENV_{}__", uuid::Uuid::new_v4().simple());
        let probe_command = build_probe_command(&marker);
        let args = build_login_shell_args(&shell_path, &probe_command);
        let previous_path = std::env::var("PATH").ok();
        let output = capture_shell_output(&shell_path, &args)?;
        let imported = parse_probe_output(&output.stdout, &marker)?;

        let mut imported_keys = 0;
        let mut skipped_keys = 0;
        for (key, value) in imported {
            if should_import_env_key(&key) {
                std::env::set_var(&key, &value);
                imported_keys += 1;
            } else {
                skipped_keys += 1;
            }
        }

        Ok(HydratedShellEnvironment {
            imported_keys,
            path_changed: std::env::var("PATH").ok() != previous_path,
            shell_path: shell_path.display().to_string(),
            skipped_keys,
        })
    }
}

fn resolve_shell_path() -> PathBuf {
    let Some(shell) = std::env::var_os("SHELL") else {
        return PathBuf::from("/bin/zsh");
    };

    let shell_path = PathBuf::from(shell);
    if shell_path.is_absolute() && shell_path.exists() {
        shell_path
    } else {
        PathBuf::from("/bin/zsh")
    }
}

fn build_login_shell_args(shell_path: &Path, probe_command: &str) -> Vec<String> {
    let shell_name = shell_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();

    match shell_name {
        "bash" => vec![
            "--login".to_string(),
            "-c".to_string(),
            probe_command.to_string(),
        ],
        _ => vec![
            "-l".to_string(),
            "-c".to_string(),
            probe_command.to_string(),
        ],
    }
}

fn build_probe_command(marker: &str) -> String {
    let start_marker = format!("{marker}:start");
    let end_marker = format!("{marker}:end");
    format!(
        "printf '%s\\0' {}; /usr/bin/env -0; printf '%s\\0' {}",
        shell_quote(&start_marker),
        shell_quote(&end_marker)
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

fn capture_shell_output(shell_path: &Path, args: &[String]) -> Result<CapturedShellOutput, String> {
    let mut child = Command::new(shell_path)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            format!(
                "failed to launch login shell {}: {error}",
                shell_path.display()
            )
        })?;

    let deadline = Instant::now() + LOGIN_SHELL_CAPTURE_TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!(
                        "login shell environment capture timed out after {}ms",
                        LOGIN_SHELL_CAPTURE_TIMEOUT.as_millis()
                    ));
                }
                thread::sleep(LOGIN_SHELL_CAPTURE_POLL_INTERVAL);
            }
            Err(error) => {
                return Err(format!(
                    "failed while waiting for login shell {}: {error}",
                    shell_path.display()
                ));
            }
        }
    };

    let stdout = read_child_pipe(child.stdout.take())?;
    let stderr = read_child_pipe(child.stderr.take())?;

    if !status.success() {
        let stderr_summary = summarize_output(&stderr);
        let stdout_summary = summarize_output(&stdout);
        let detail = if !stderr_summary.is_empty() {
            stderr_summary
        } else if !stdout_summary.is_empty() {
            stdout_summary
        } else {
            "no diagnostic output".to_string()
        };
        return Err(format!(
            "login shell {} exited with status {}: {detail}",
            shell_path.display(),
            status
        ));
    }

    Ok(CapturedShellOutput { stdout })
}

fn read_child_pipe(pipe: Option<impl Read>) -> Result<Vec<u8>, String> {
    let Some(mut pipe) = pipe else {
        return Ok(Vec::new());
    };

    let mut buffer = Vec::new();
    pipe.read_to_end(&mut buffer)
        .map_err(|error| format!("failed to read shell output: {error}"))?;
    Ok(buffer)
}

fn parse_probe_output(bytes: &[u8], marker: &str) -> Result<HashMap<String, String>, String> {
    let start_marker = marker_bytes(&format!("{marker}:start"));
    let end_marker = marker_bytes(&format!("{marker}:end"));

    let Some(start_offset) = find_subsequence(bytes, &start_marker) else {
        return Err(format!(
            "login shell output did not include the start marker; stdout={}",
            summarize_output(bytes)
        ));
    };
    let env_start = start_offset + start_marker.len();

    let Some(relative_end_offset) = find_subsequence(&bytes[env_start..], &end_marker) else {
        return Err(format!(
            "login shell output did not include the end marker; stdout={}",
            summarize_output(bytes)
        ));
    };
    let env_end = env_start + relative_end_offset;

    Ok(parse_env_block(&bytes[env_start..env_end]))
}

fn marker_bytes(marker: &str) -> Vec<u8> {
    let mut bytes = marker.as_bytes().to_vec();
    bytes.push(0);
    bytes
}

fn parse_env_block(bytes: &[u8]) -> HashMap<String, String> {
    let mut env = HashMap::new();

    for record in bytes.split(|byte| *byte == 0) {
        if record.is_empty() {
            continue;
        }

        let Some(separator_index) = record.iter().position(|byte| *byte == b'=') else {
            continue;
        };

        let key = String::from_utf8_lossy(&record[..separator_index]).to_string();
        if key.is_empty() {
            continue;
        }

        let value = String::from_utf8_lossy(&record[separator_index + 1..]).to_string();
        env.insert(key, value);
    }

    env
}

fn should_import_env_key(key: &str) -> bool {
    !matches!(key, "OLDPWD" | "PWD" | "SHLVL" | "_")
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() {
        return Some(0);
    }

    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn summarize_output(bytes: &[u8]) -> String {
    const MAX_LEN: usize = 240;

    let rendered = String::from_utf8_lossy(bytes).replace('\0', "\\0");
    let compact = rendered.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.len() <= MAX_LEN {
        compact
    } else {
        format!("{}...", &compact[..MAX_LEN])
    }
}

struct CapturedShellOutput {
    stdout: Vec<u8>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_login_shell_args_uses_bash_login_flag() {
        assert_eq!(
            build_login_shell_args(Path::new("/bin/bash"), "echo hi"),
            vec!["--login", "-c", "echo hi"]
        );
    }

    #[test]
    fn build_login_shell_args_uses_generic_login_flag_for_zsh() {
        assert_eq!(
            build_login_shell_args(Path::new("/bin/zsh"), "echo hi"),
            vec!["-l", "-c", "echo hi"]
        );
    }

    #[test]
    fn parse_probe_output_extracts_env_between_markers() {
        let marker = "__TEST__";
        let output = b"noise before __ignored__\0__TEST__:start\0PATH=/opt/homebrew/bin\0HOME=/Users/kyle\0__TEST__:end\0noise after";

        let parsed = parse_probe_output(output, marker).expect("probe output should parse");

        assert_eq!(parsed.get("PATH"), Some(&"/opt/homebrew/bin".to_string()));
        assert_eq!(parsed.get("HOME"), Some(&"/Users/kyle".to_string()));
    }

    #[test]
    fn parse_probe_output_rejects_missing_markers() {
        let error = parse_probe_output(b"PATH=/usr/bin\0", "__TEST__").expect_err("must fail");
        assert!(error.contains("start marker"));
    }

    #[test]
    fn should_import_env_key_skips_ephemeral_shell_keys() {
        assert!(!should_import_env_key("PWD"));
        assert!(!should_import_env_key("SHLVL"));
        assert!(should_import_env_key("PATH"));
    }
}
