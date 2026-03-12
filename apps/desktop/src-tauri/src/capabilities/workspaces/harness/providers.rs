#[path = "providers/claude.rs"]
mod claude;
#[path = "providers/codex.rs"]
mod codex;

use super::types::HarnessAdapter;

const HARNESS_ADAPTERS: &[HarnessAdapter] = &[claude::ADAPTER, codex::ADAPTER];

pub(crate) fn resolve_harness_adapter(provider: Option<&str>) -> Option<HarnessAdapter> {
    let provider = provider?;
    HARNESS_ADAPTERS
        .iter()
        .copied()
        .find(|adapter| adapter.name == provider)
}

pub(crate) fn default_harness_terminal_label(
    harness_provider: Option<&str>,
    sequence: i64,
) -> String {
    match resolve_harness_adapter(harness_provider) {
        Some(adapter) => format!("{} · Session {sequence}", adapter.display_name),
        None => format!("Harness · Session {sequence}"),
    }
}
