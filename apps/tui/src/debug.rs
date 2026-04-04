use std::fs::{File, OpenOptions};
use std::io::Write;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

static LOG_FILE: OnceLock<Option<Mutex<File>>> = OnceLock::new();

pub fn init() {
    let _ = LOG_FILE.get_or_init(|| {
        let path = std::env::var_os("LIFECYCLE_TUI_DEBUG_LOG").or_else(|| {
            std::env::var_os("LIFECYCLE_TUI_DEBUG").map(|_| "/tmp/lifecycle-tui.log".into())
        })?;

        OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .ok()
            .map(Mutex::new)
    });
}

pub fn log(message: impl AsRef<str>) {
    let Some(Some(file)) = LOG_FILE.get() else {
        return;
    };

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|dur| dur.as_millis())
        .unwrap_or(0);

    if let Ok(mut file) = file.lock() {
        let _ = writeln!(file, "[{ts}] {}", message.as_ref());
        let _ = file.flush();
    }
}
