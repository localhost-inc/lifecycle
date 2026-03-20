#[path = "environment/execution.rs"]
mod execution;
#[path = "environment/graph.rs"]
mod graph;
#[path = "environment/lifecycle.rs"]
mod lifecycle;
#[path = "environment/port_assignment.rs"]
mod port_assignment;
#[path = "environment/runtime_env.rs"]
mod runtime_env;

pub use lifecycle::{start_services, sync_workspace_manifest_from_disk_if_idle};
