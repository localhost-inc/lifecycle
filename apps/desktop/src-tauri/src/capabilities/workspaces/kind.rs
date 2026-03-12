pub(crate) const ROOT_WORKSPACE_KIND: &str = "root";
pub(crate) const MANAGED_WORKSPACE_KIND: &str = "managed";

pub(crate) fn normalize_workspace_kind(value: Option<&str>) -> &'static str {
    match value.map(str::trim) {
        Some(ROOT_WORKSPACE_KIND) => ROOT_WORKSPACE_KIND,
        _ => MANAGED_WORKSPACE_KIND,
    }
}

pub(crate) fn is_root_workspace_kind(value: &str) -> bool {
    value == ROOT_WORKSPACE_KIND
}
