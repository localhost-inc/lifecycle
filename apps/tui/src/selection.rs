use std::fs::{create_dir_all, read_to_string, write};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Deserialize, Serialize)]
struct SelectionState {
    workspace_id: Option<String>,
}

fn selection_state_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(
        PathBuf::from(home)
            .join(".lifecycle")
            .join("tui")
            .join("state.json"),
    )
}

pub fn load_workspace_selection() -> Option<String> {
    let path = selection_state_path()?;
    let value = read_to_string(path).ok()?;
    let state = serde_json::from_str::<SelectionState>(&value).ok()?;
    state.workspace_id.filter(|value| !value.trim().is_empty())
}

pub fn save_workspace_selection(workspace_id: Option<&str>) {
    let Some(path) = selection_state_path() else {
        return;
    };
    let Some(parent) = path.parent() else {
        return;
    };
    if create_dir_all(parent).is_err() {
        return;
    }

    let state = SelectionState {
        workspace_id: workspace_id.map(ToOwned::to_owned),
    };
    let Ok(json) = serde_json::to_string_pretty(&state) else {
        return;
    };
    let _ = write(path, format!("{json}\n"));
}
