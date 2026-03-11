use std::collections::{BTreeSet, HashMap, HashSet};

use crate::shared::errors::LifecycleError;

use super::manifest::{LifecycleConfig, ServiceConfig, SetupStep};

const SETUP_TASK_PREFIX: &str = "__setup_step__";

#[derive(Clone, Debug)]
pub(super) struct LoweredEnvironmentGraph {
    pub workspace_setup: Vec<SetupStep>,
    pub environment_nodes: HashMap<String, EnvironmentNode>,
}

#[derive(Clone, Debug)]
pub(super) struct EnvironmentNode {
    pub kind: EnvironmentNodeKind,
    pub depends_on: Vec<String>,
}

impl EnvironmentNode {
    pub fn depends_on(&self) -> &[String] {
        &self.depends_on
    }
}

#[derive(Clone, Debug)]
pub(super) enum EnvironmentNodeKind {
    Task(SetupStep),
    Service(ServiceConfig),
}

pub(super) fn should_run_setup_step(step: &SetupStep, setup_completed: bool) -> bool {
    match step.run_on.as_deref() {
        Some("start") => true,
        _ => !setup_completed,
    }
}

pub(super) fn lower_environment_graph(
    config: &LifecycleConfig,
    setup_completed: bool,
) -> Result<LoweredEnvironmentGraph, LifecycleError> {
    let active_steps = config
        .setup
        .steps
        .iter()
        .filter(|step| should_run_setup_step(step, setup_completed))
        .cloned()
        .collect::<Vec<_>>();
    let requested_setup_services = config
        .setup
        .services
        .as_ref()
        .filter(|services| !services.is_empty());

    if requested_setup_services.is_none() {
        return Ok(LoweredEnvironmentGraph {
            workspace_setup: active_steps,
            environment_nodes: lower_service_nodes(config, None),
        });
    }

    let requested_setup_services = requested_setup_services.expect("checked above");
    let setup_service_names =
        expand_requested_service_names(&config.services, requested_setup_services)?;
    let mut environment_nodes = HashMap::new();
    let mut last_task_id: Option<String> = None;

    for (index, step) in active_steps.iter().cloned().enumerate() {
        let task_id = setup_task_id(index, &step.name);
        let depends_on = if let Some(previous_task_id) = last_task_id.as_ref() {
            vec![previous_task_id.clone()]
        } else {
            requested_setup_services.to_vec()
        };
        environment_nodes.insert(
            task_id.clone(),
            EnvironmentNode {
                kind: EnvironmentNodeKind::Task(step),
                depends_on,
            },
        );
        last_task_id = Some(task_id);
    }

    for (service_name, service_config) in &config.services {
        let mut depends_on = service_config.depends_on().to_vec();
        if let Some(task_id) = last_task_id.as_ref() {
            if !setup_service_names.contains(service_name) {
                depends_on.push(task_id.clone());
            }
        }
        dedupe_preserving_order(&mut depends_on);
        environment_nodes.insert(
            service_name.clone(),
            EnvironmentNode {
                kind: EnvironmentNodeKind::Service(clone_service_with_depends_on(
                    service_config,
                    depends_on.clone(),
                )),
                depends_on,
            },
        );
    }

    Ok(LoweredEnvironmentGraph {
        workspace_setup: Vec::new(),
        environment_nodes,
    })
}

fn lower_service_nodes(
    config: &LifecycleConfig,
    runtime_barrier: Option<&str>,
) -> HashMap<String, EnvironmentNode> {
    let mut nodes = HashMap::new();
    for (service_name, service_config) in &config.services {
        let mut depends_on = service_config.depends_on().to_vec();
        if let Some(barrier) = runtime_barrier {
            depends_on.push(barrier.to_string());
        }
        dedupe_preserving_order(&mut depends_on);
        nodes.insert(
            service_name.clone(),
            EnvironmentNode {
                kind: EnvironmentNodeKind::Service(clone_service_with_depends_on(
                    service_config,
                    depends_on.clone(),
                )),
                depends_on,
            },
        );
    }
    nodes
}

fn expand_requested_service_names(
    services: &HashMap<String, ServiceConfig>,
    requested: &[String],
) -> Result<HashSet<String>, LifecycleError> {
    let mut expanded = HashSet::new();
    let mut stack = requested.iter().cloned().collect::<Vec<_>>();

    while let Some(service_name) = stack.pop() {
        let Some(service) = services.get(&service_name) else {
            return Err(LifecycleError::ServiceStartFailed {
                service: service_name.clone(),
                reason: format!("setup requires missing service '{service_name}'"),
            });
        };

        if !expanded.insert(service_name.clone()) {
            continue;
        }

        for dependency in service.depends_on() {
            stack.push(dependency.clone());
        }
    }

    Ok(expanded)
}

fn clone_service_with_depends_on(
    service: &ServiceConfig,
    depends_on: Vec<String>,
) -> ServiceConfig {
    match service {
        ServiceConfig::Process(process) => {
            let mut next = process.clone();
            next.depends_on = (!depends_on.is_empty()).then_some(depends_on);
            ServiceConfig::Process(next)
        }
        ServiceConfig::Image(image) => {
            let mut next = image.clone();
            next.depends_on = (!depends_on.is_empty()).then_some(depends_on);
            ServiceConfig::Image(next)
        }
    }
}

fn setup_task_id(index: usize, step_name: &str) -> String {
    let slug = step_name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if slug.is_empty() {
        format!("{SETUP_TASK_PREFIX}{index}")
    } else {
        format!("{SETUP_TASK_PREFIX}{index}-{slug}")
    }
}

fn dedupe_preserving_order(values: &mut Vec<String>) {
    let mut seen = HashSet::new();
    values.retain(|value| seen.insert(value.clone()));
}

pub(super) fn topo_sort_environment_nodes<'a>(
    nodes: &'a HashMap<String, EnvironmentNode>,
) -> Result<Vec<(&'a str, &'a EnvironmentNode)>, LifecycleError> {
    let mut in_degree = HashMap::<&str, usize>::new();
    let mut dependents = HashMap::<&str, Vec<&str>>::new();

    for node_name in nodes.keys() {
        in_degree.entry(node_name.as_str()).or_insert(0);
    }

    for (node_name, node) in nodes {
        for dependency in node.depends_on() {
            if !nodes.contains_key(dependency) {
                return Err(LifecycleError::ServiceStartFailed {
                    service: node_name.clone(),
                    reason: format!("node '{node_name}' depends on missing node '{dependency}'"),
                });
            }

            dependents
                .entry(dependency.as_str())
                .or_default()
                .push(node_name.as_str());
            *in_degree.entry(node_name.as_str()).or_insert(0) += 1;
        }
    }

    let mut ready = BTreeSet::new();
    for (node_name, &degree) in &in_degree {
        if degree == 0 {
            ready.insert(*node_name);
        }
    }

    let mut result = Vec::new();
    while let Some(node_name) = ready.pop_first() {
        let node = nodes
            .get(node_name)
            .expect("node should exist while sorting environment graph");
        result.push((node_name, node));

        if let Some(next_nodes) = dependents.get(node_name) {
            for next_node in next_nodes {
                if let Some(degree) = in_degree.get_mut(next_node) {
                    *degree -= 1;
                    if *degree == 0 {
                        ready.insert(*next_node);
                    }
                }
            }
        }
    }

    if result.len() != nodes.len() {
        let sorted = result
            .iter()
            .map(|(node_name, _)| *node_name)
            .collect::<HashSet<_>>();
        let mut unresolved = nodes
            .keys()
            .filter(|node_name| !sorted.contains(node_name.as_str()))
            .cloned()
            .collect::<Vec<_>>();
        unresolved.sort();
        let node_name = unresolved
            .first()
            .cloned()
            .unwrap_or_else(|| "unknown".to_string());

        return Err(LifecycleError::ServiceStartFailed {
            service: node_name,
            reason: format!("dependency cycle detected: {}", unresolved.join(", ")),
        });
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_config(json: &str) -> LifecycleConfig {
        serde_json::from_str(json).expect("valid config")
    }

    #[test]
    fn lowers_plain_setup_steps_into_workspace_setup() {
        let config = parse_config(
            r#"{
                "setup": {
                    "steps": [
                        { "name": "install", "command": "bun install", "timeout_seconds": 60 },
                        { "name": "codegen", "command": "bun run codegen", "timeout_seconds": 60, "run_on": "start" }
                    ]
                },
                "services": {
                    "api": { "runtime": "process", "command": "bun run api" }
                }
            }"#,
        );

        let graph = lower_environment_graph(&config, false).expect("graph lowers");

        assert_eq!(graph.workspace_setup.len(), 2);
        assert!(graph
            .environment_nodes
            .get("api")
            .is_some_and(|node| matches!(node.kind, EnvironmentNodeKind::Service(_))));
        assert!(!graph
            .environment_nodes
            .values()
            .any(|node| matches!(node.kind, EnvironmentNodeKind::Task(_))));
    }

    #[test]
    fn lowers_service_backed_setup_into_task_chain_and_runtime_barrier() {
        let config = parse_config(
            r#"{
                "setup": {
                    "services": ["api"],
                    "steps": [
                        { "name": "install", "command": "bun install", "timeout_seconds": 60 },
                        { "name": "migrate", "command": "bun run db:migrate", "timeout_seconds": 60, "run_on": "start" }
                    ]
                },
                "services": {
                    "web": { "runtime": "process", "command": "bun run web", "depends_on": ["api"] },
                    "api": { "runtime": "process", "command": "bun run api", "depends_on": ["postgres"] },
                    "postgres": { "runtime": "image", "image": "postgres:16" }
                }
            }"#,
        );

        let graph = lower_environment_graph(&config, false).expect("graph lowers");

        assert!(graph.workspace_setup.is_empty());

        let mut task_ids = graph
            .environment_nodes
            .iter()
            .filter_map(|(node_id, node)| {
                matches!(node.kind, EnvironmentNodeKind::Task(_)).then_some(node_id.clone())
            })
            .collect::<Vec<_>>();
        task_ids.sort();
        assert_eq!(task_ids.len(), 2);

        let first_task = graph
            .environment_nodes
            .get(&task_ids[0])
            .expect("first task present");
        assert_eq!(first_task.depends_on(), ["api"]);

        let second_task = graph
            .environment_nodes
            .get(&task_ids[1])
            .expect("second task present");
        assert_eq!(second_task.depends_on(), [task_ids[0].clone()]);

        let api = graph
            .environment_nodes
            .get("api")
            .expect("api node present");
        assert_eq!(api.depends_on(), ["postgres"]);

        let web = graph
            .environment_nodes
            .get("web")
            .expect("web node present");
        assert_eq!(web.depends_on().len(), 2);
        assert!(web.depends_on().contains(&"api".to_string()));
        assert!(web.depends_on().contains(&task_ids[1]));
    }

    #[test]
    fn filters_create_scoped_service_backed_steps_after_first_successful_start() {
        let config = parse_config(
            r#"{
                "setup": {
                    "services": ["postgres"],
                    "steps": [
                        { "name": "seed", "command": "bun run seed", "timeout_seconds": 60 }
                    ]
                },
                "services": {
                    "postgres": { "runtime": "image", "image": "postgres:16" },
                    "api": { "runtime": "process", "command": "bun run api", "depends_on": ["postgres"] }
                }
            }"#,
        );

        let graph = lower_environment_graph(&config, true).expect("graph lowers");

        assert!(!graph
            .environment_nodes
            .values()
            .any(|node| matches!(node.kind, EnvironmentNodeKind::Task(_))));
        let api = graph
            .environment_nodes
            .get("api")
            .expect("api node present");
        assert_eq!(api.depends_on(), ["postgres"]);
    }

    #[test]
    fn topo_sort_environment_nodes_orders_services_before_dependent_tasks() {
        let config = parse_config(
            r#"{
                "setup": {
                    "services": ["api"],
                    "steps": [
                        { "name": "migrate", "command": "bun run db:migrate", "timeout_seconds": 60 }
                    ]
                },
                "services": {
                    "web": { "runtime": "process", "command": "bun run web", "depends_on": ["api"] },
                    "api": { "runtime": "process", "command": "bun run api", "depends_on": ["postgres"] },
                    "postgres": { "runtime": "image", "image": "postgres:16" }
                }
            }"#,
        );

        let graph = lower_environment_graph(&config, false).expect("graph lowers");
        let sorted = topo_sort_environment_nodes(&graph.environment_nodes).expect("nodes sort");
        let sorted_names = sorted
            .into_iter()
            .map(|(node_name, _)| node_name.to_string())
            .collect::<Vec<_>>();

        let postgres_index = sorted_names
            .iter()
            .position(|node_name| node_name == "postgres")
            .expect("postgres present");
        let api_index = sorted_names
            .iter()
            .position(|node_name| node_name == "api")
            .expect("api present");
        let web_index = sorted_names
            .iter()
            .position(|node_name| node_name == "web")
            .expect("web present");
        let task_index = sorted_names
            .iter()
            .position(|node_name| node_name.starts_with(SETUP_TASK_PREFIX))
            .expect("task present");

        assert!(postgres_index < api_index);
        assert!(api_index < task_index);
        assert!(task_index < web_index);
    }

    #[test]
    fn topo_sort_environment_nodes_fails_when_dependency_is_missing() {
        let config = parse_config(
            r#"{
                "setup": {
                    "services": ["postgres"],
                    "steps": [{ "name": "migrate", "command": "bun run db:migrate", "timeout_seconds": 60 }]
                },
                "services": {
                    "api": { "runtime": "process", "command": "bun run api" }
                }
            }"#,
        );

        let error = lower_environment_graph(&config, false)
            .expect_err("missing setup dependency should fail lowering");
        match error {
            LifecycleError::ServiceStartFailed { service, reason } => {
                assert_eq!(service, "postgres");
                assert!(reason.contains("setup requires missing service"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn topo_sort_environment_nodes_fails_on_cycle() {
        let config = parse_config(
            r#"{
                "setup": {
                    "steps": [{ "name": "install", "command": "bun install", "timeout_seconds": 60 }]
                },
                "services": {
                    "api": { "runtime": "process", "command": "bun run api", "depends_on": ["db"] },
                    "db": { "runtime": "process", "command": "bun run db", "depends_on": ["api"] }
                }
            }"#,
        );

        let graph = lower_environment_graph(&config, false).expect("graph lowers");
        let error =
            topo_sort_environment_nodes(&graph.environment_nodes).expect_err("cycle should fail");
        match error {
            LifecycleError::ServiceStartFailed { reason, .. } => {
                assert!(reason.contains("dependency cycle"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }
}
