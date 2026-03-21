pub(crate) const ROOT_WORKSPACE_CHECKOUT_TYPE: &str = "root";
pub(crate) const WORKTREE_WORKSPACE_CHECKOUT_TYPE: &str = "worktree";

pub(crate) fn normalize_workspace_checkout_type(value: Option<&str>) -> &'static str {
    match value.map(str::trim) {
        Some(ROOT_WORKSPACE_CHECKOUT_TYPE) => ROOT_WORKSPACE_CHECKOUT_TYPE,
        _ => WORKTREE_WORKSPACE_CHECKOUT_TYPE,
    }
}

pub(crate) fn is_root_workspace_checkout_type(value: &str) -> bool {
    value == ROOT_WORKSPACE_CHECKOUT_TYPE
}
