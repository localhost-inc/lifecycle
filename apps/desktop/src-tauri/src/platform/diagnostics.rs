use std::backtrace::Backtrace;
use std::fmt::Display;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static DIAGNOSTIC_LOG_PATH: OnceLock<PathBuf> = OnceLock::new();
static DIAGNOSTIC_LOG_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static PANIC_HOOK_INSTALLED: OnceLock<()> = OnceLock::new();

fn diagnostic_lock() -> &'static Mutex<()> {
    DIAGNOSTIC_LOG_LOCK.get_or_init(|| Mutex::new(()))
}

pub fn initialize(app_data_dir: &Path) -> PathBuf {
    let log_path = app_data_dir.join("lifecycle-diagnostics.log");
    let _ = DIAGNOSTIC_LOG_PATH.set(log_path.clone());

    let _ = tracing_subscriber::fmt()
        .with_ansi(false)
        .with_target(true)
        .try_init();

    std::env::set_var("RUST_BACKTRACE", "1");

    if PANIC_HOOK_INSTALLED.set(()).is_ok() {
        let previous_hook = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |panic_info| {
            let location = panic_info
                .location()
                .map(|location| format!("{}:{}:{}", location.file(), location.line(), location.column()))
                .unwrap_or_else(|| "unknown".to_string());
            let payload = panic_info
                .payload()
                .downcast_ref::<&str>()
                .map(|value| (*value).to_string())
                .or_else(|| panic_info.payload().downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "non-string panic payload".to_string());
            let backtrace = Backtrace::force_capture();
            append_diagnostic(
                "panic",
                &format!("panic at {location}: {payload}\n{backtrace}"),
            );
            previous_hook(panic_info);
        }));
    }

    append_diagnostic(
        "startup",
        &format!("diagnostics initialized at {}", log_path.display()),
    );
    log_path
}

pub fn append_error(context: &str, error: impl Display) {
    append_diagnostic(context, &error.to_string());
}

pub fn append_diagnostic(context: &str, message: &str) {
    let formatted = format!("[{context}] {message}\n");
    eprintln!("{formatted}");

    let Some(path) = DIAGNOSTIC_LOG_PATH.get() else {
        return;
    };

    let _guard = diagnostic_lock().lock().ok();
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(formatted.as_bytes());
        let _ = file.flush();
    }
}

pub fn diagnostic_log_path() -> Option<&'static Path> {
    DIAGNOSTIC_LOG_PATH.get().map(PathBuf::as_path)
}
