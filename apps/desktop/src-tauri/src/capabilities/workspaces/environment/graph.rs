use std::collections::{BTreeSet, HashMap, HashSet};

use crate::shared::errors::LifecycleError;

use super::super::manifest::{
    EnvironmentNodeConfig, LifecycleConfig, ServiceConfig, SetupStep, TaskConfig,
};

#[derive(Clone, Debug)]
pub(in crate::capabilities::workspaces) struct LoweredEnvironmentGraph {
    pub workspace_setup: Vec<SetupStep>,
    pub environment_nodes: HashMap<String, EnvironmentNode>,
}

#[derive(Clone, Debug)]
pub(in crate::capabilities::workspaces) struct EnvironmentNode {
    pub kind: EnvironmentNodeKind,
    pub depends_on: Vec<String>,
}

impl EnvironmentNode {
    pub fn depends_on(&self) -> &[String] {
        &self.depends_on
    }
}

#[derive(Clone, Debug)]
pub(in crate::capabilities::workspaces) enum EnvironmentNodeKind {
    Task(SetupStep),
    Service(ServiceConfig),
}

fn should_run_run_on(run_on: Option<&str>, setup_completed: bool) -> bool {
    match run_on {
        Some("start") => true,
        _ => !setup_completed,
    }
}

pub(in crate::capabilities::workspaces) fn should_run_step(
    step: &SetupStep,
    setup_completed: bool,
) -> bool {
    should_run_run_on(step.run_on.as_deref(), setup_completed)
}

fn should_run_task(step: &TaskConfig, setup_completed: bool) -> bool {
    should_run_run_on(step.run_on.as_deref(), setup_completed)
}

fn filter_satisfied_dependencies(
    depends_on: &[String],
    satisfied_nodes: &std::collections::HashSet<String>,
) -> Vec<String> {
    depends_on
        .iter()
        .filter(|dependency| !satisfied_nodes.contains(*dependency))
        .cloned()
        .collect()
}

fn collect_selected_node_names(
    config: &LifecycleConfig,
    node_name: &str,
    selected: &mut HashSet<String>,
    satisfied_service_names: &HashSet<String>,
) -> Result<(), LifecycleError> {
    let node =
        config
            .environment
            .get(node_name)
            .ok_or_else(|| LifecycleError::ServiceStartFailed {
                service: node_name.to_string(),
                reason: format!("node '{node_name}' is not declared in environment"),
            })?;

    if matches!(node, EnvironmentNodeConfig::Service { .. })
        && satisfied_service_names.contains(node_name)
    {
        return Ok(());
    }

    if !selected.insert(node_name.to_string()) {
        return Ok(());
    }

    let dependencies = match node {
        EnvironmentNodeConfig::Task(task) => task.depends_on(),
        EnvironmentNodeConfig::Service { config } => config.depends_on(),
    };

    for dependency in dependencies {
        collect_selected_node_names(config, dependency, selected, satisfied_service_names)?;
    }

    Ok(())
}

fn resolve_selected_node_names(
    config: &LifecycleConfig,
    target_service_names: Option<&[String]>,
    satisfied_service_names: &HashSet<String>,
) -> Result<Option<HashSet<String>>, LifecycleError> {
    let Some(target_service_names) = target_service_names else {
        return Ok(None);
    };

    if target_service_names.is_empty() {
        return Ok(None);
    }

    let mut selected = HashSet::new();
    for service_name in target_service_names {
        let node =
            config
                .environment
                .get(service_name)
                .ok_or_else(|| LifecycleError::InvalidInput {
                    field: "serviceNames".to_string(),
                    reason: format!("unknown service '{service_name}'"),
                })?;
        if !matches!(node, EnvironmentNodeConfig::Service { .. }) {
            return Err(LifecycleError::InvalidInput {
                field: "serviceNames".to_string(),
                reason: format!("'{service_name}' is not a service node"),
            });
        }
        collect_selected_node_names(config, service_name, &mut selected, satisfied_service_names)?;
    }

    Ok(Some(selected))
}

pub(in crate::capabilities::workspaces) fn lower_environment_graph(
    config: &LifecycleConfig,
    setup_completed: bool,
    target_service_names: Option<&[String]>,
    satisfied_service_names: Option<&HashSet<String>>,
) -> Result<LoweredEnvironmentGraph, LifecycleError> {
    let satisfied_service_names = satisfied_service_names.cloned().unwrap_or_default();
    let selected_node_names =
        resolve_selected_node_names(config, target_service_names, &satisfied_service_names)?;
    let workspace_setup = config
        .workspace
        .setup
        .iter()
        .filter(|step| should_run_step(step, setup_completed))
        .cloned()
        .collect::<Vec<_>>();

    let satisfied_nodes = config
        .environment
        .iter()
        .filter_map(|(node_name, node_config)| match node_config {
            EnvironmentNodeConfig::Task(step) if !should_run_task(step, setup_completed) => {
                Some(node_name.clone())
            }
            _ => None,
        })
        .collect::<HashSet<_>>();
    let mut satisfied_nodes = satisfied_nodes;
    satisfied_nodes.extend(satisfied_service_names);

    let mut environment_nodes = HashMap::new();
    for (node_name, node_config) in &config.environment {
        if selected_node_names
            .as_ref()
            .is_some_and(|selected| !selected.contains(node_name))
        {
            continue;
        }
        match node_config {
            EnvironmentNodeConfig::Task(step) => {
                if !should_run_task(step, setup_completed) {
                    continue;
                }
                let lowered_step = step.clone().into_setup_step(node_name.clone());
                environment_nodes.insert(
                    node_name.clone(),
                    EnvironmentNode {
                        kind: EnvironmentNodeKind::Task(lowered_step),
                        depends_on: filter_satisfied_dependencies(
                            step.depends_on(),
                            &satisfied_nodes,
                        ),
                    },
                );
            }
            EnvironmentNodeConfig::Service { config } => {
                let depends_on =
                    filter_satisfied_dependencies(config.depends_on(), &satisfied_nodes);
                environment_nodes.insert(
                    node_name.clone(),
                    EnvironmentNode {
                        kind: EnvironmentNodeKind::Service(clone_service_with_depends_on(
                            config,
                            depends_on.clone(),
                        )),
                        depends_on,
                    },
                );
            }
        }
    }

    validate_dependencies_exist(&environment_nodes)?;

    Ok(LoweredEnvironmentGraph {
        workspace_setup,
        environment_nodes,
    })
}

fn validate_dependencies_exist(
    nodes: &HashMap<String, EnvironmentNode>,
) -> Result<(), LifecycleError> {
    for (node_name, node) in nodes {
        for dependency in node.depends_on() {
            if !nodes.contains_key(dependency) {
                return Err(LifecycleError::ServiceStartFailed {
                    service: node_name.clone(),
                    reason: format!("node '{node_name}' depends on missing node '{dependency}'"),
                });
            }
        }
    }

    Ok(())
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

pub(in crate::capabilities::workspaces) fn topo_sort_environment_nodes<'a>(
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
    fn lowers_workspace_setup_and_environment_nodes() {
        let config = parse_config(
            r#"{
                "workspace": {
                    "setup": [
                        { "name": "install", "command": "bun install", "timeout_seconds": 60 },
                        { "name": "codegen", "command": "bun run codegen", "timeout_seconds": 60, "run_on": "start" }
                    ]
                },
                "environment": {
                    "api": { "kind": "service", "runtime": "process", "command": "bun run api" },
                    "migrate": {
                        "kind": "task",
                        "command": "bun run db:migrate",
                        "depends_on": ["api"],
                        "timeout_seconds": 60
                    }
                }
            }"#,
        );

        let graph = lower_environment_graph(&config, false, None, None).expect("graph lowers");

        assert_eq!(graph.workspace_setup.len(), 2);
        assert!(graph
            .environment_nodes
            .get("api")
            .is_some_and(|node| matches!(node.kind, EnvironmentNodeKind::Service(_))));
        assert!(graph
            .environment_nodes
            .get("migrate")
            .is_some_and(|node| matches!(node.kind, EnvironmentNodeKind::Task(_))));
    }

    #[test]
    fn filters_create_scoped_nodes_after_first_successful_start() {
        let config = parse_config(
            r#"{
                "workspace": {
                    "setup": [
                        { "name": "install", "command": "bun install", "timeout_seconds": 60 }
                    ]
                },
                "environment": {
                    "postgres": { "kind": "service", "runtime": "image", "image": "postgres:16" },
                    "seed": {
                        "kind": "task",
                        "command": "bun run seed",
                        "depends_on": ["postgres"],
                        "timeout_seconds": 60
                    },
                    "migrate": {
                        "kind": "task",
                        "command": "bun run db:migrate",
                        "depends_on": ["postgres"],
                        "timeout_seconds": 60,
                        "run_on": "start"
                    }
                }
            }"#,
        );

        let graph = lower_environment_graph(&config, true, None, None).expect("graph lowers");

        assert!(graph.workspace_setup.is_empty());
        assert!(!graph.environment_nodes.contains_key("seed"));
        assert!(graph.environment_nodes.contains_key("migrate"));
    }

    #[test]
    fn lower_environment_graph_treats_skipped_create_tasks_as_satisfied_dependencies() {
        let config = parse_config(
            r#"{
                "workspace": { "setup": [] },
                "environment": {
                    "postgres": { "kind": "service", "runtime": "image", "image": "postgres:16" },
                    "seed": {
                        "kind": "task",
                        "command": "bun run seed",
                        "depends_on": ["postgres"],
                        "timeout_seconds": 60
                    },
                    "api": {
                        "kind": "service",
                        "runtime": "process",
                        "command": "bun run api",
                        "depends_on": ["seed", "postgres"]
                    }
                }
            }"#,
        );

        let graph = lower_environment_graph(&config, true, None, None).expect("graph lowers");

        assert!(!graph.environment_nodes.contains_key("seed"));
        assert_eq!(
            graph
                .environment_nodes
                .get("api")
                .expect("api present")
                .depends_on(),
            ["postgres"]
        );
    }

    #[test]
    fn topo_sort_environment_nodes_orders_dependencies_before_dependents() {
        let config = parse_config(
            r#"{
                "workspace": { "setup": [] },
                "environment": {
                    "web": { "kind": "service", "runtime": "process", "command": "bun run web", "depends_on": ["api"] },
                    "api": { "kind": "service", "runtime": "process", "command": "bun run api", "depends_on": ["postgres", "migrate"] },
                    "postgres": { "kind": "service", "runtime": "image", "image": "postgres:16" },
                    "migrate": {
                        "kind": "task",
                        "command": "bun run db:migrate",
                        "depends_on": ["postgres"],
                        "timeout_seconds": 60
                    }
                }
            }"#,
        );

        let graph = lower_environment_graph(&config, false, None, None).expect("graph lowers");
        let sorted = topo_sort_environment_nodes(&graph.environment_nodes).expect("nodes sort");
        let sorted_names = sorted
            .into_iter()
            .map(|(node_name, _)| node_name.to_string())
            .collect::<Vec<_>>();

        let postgres_index = sorted_names
            .iter()
            .position(|node_name| node_name == "postgres")
            .expect("postgres present");
        let migrate_index = sorted_names
            .iter()
            .position(|node_name| node_name == "migrate")
            .expect("migrate present");
        let api_index = sorted_names
            .iter()
            .position(|node_name| node_name == "api")
            .expect("api present");
        let web_index = sorted_names
            .iter()
            .position(|node_name| node_name == "web")
            .expect("web present");

        assert!(postgres_index < migrate_index);
        assert!(migrate_index < api_index);
        assert!(api_index < web_index);
    }

    #[test]
    fn lower_environment_graph_can_select_a_service_and_its_dependencies() {
        let config = parse_config(
            r#"{
                "workspace": { "setup": [] },
                "environment": {
                    "api": { "kind": "service", "runtime": "process", "command": "bun run api" },
                    "www": { "kind": "service", "runtime": "process", "command": "bun run www", "depends_on": ["api"] },
                    "docs": { "kind": "service", "runtime": "process", "command": "bun run docs" }
                }
            }"#,
        );

        let graph = lower_environment_graph(&config, false, Some(&["www".to_string()]), None)
            .expect("graph lowers");

        let node_names = graph
            .environment_nodes
            .keys()
            .cloned()
            .collect::<BTreeSet<_>>();
        assert_eq!(
            node_names,
            BTreeSet::from(["api".to_string(), "www".to_string()])
        );
    }

    #[test]
    fn lower_environment_graph_rejects_unknown_selected_services() {
        let config = parse_config(
            r#"{
                "workspace": { "setup": [] },
                "environment": {
                    "api": { "kind": "service", "runtime": "process", "command": "bun run api" }
                }
            }"#,
        );

        let error = lower_environment_graph(&config, false, Some(&["www".to_string()]), None)
            .expect_err("unknown service should fail lowering");
        match error {
            LifecycleError::InvalidInput { field, reason } => {
                assert_eq!(field, "serviceNames");
                assert!(reason.contains("unknown service"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn lower_environment_graph_fails_when_dependency_is_missing() {
        let config = parse_config(
            r#"{
                "workspace": { "setup": [] },
                "environment": {
                    "api": { "kind": "service", "runtime": "process", "command": "bun run api", "depends_on": ["postgres"] }
                }
            }"#,
        );

        let error = lower_environment_graph(&config, false, None, None)
            .expect_err("missing dependency should fail lowering");
        match error {
            LifecycleError::ServiceStartFailed { service, reason } => {
                assert_eq!(service, "api");
                assert!(reason.contains("depends on missing node"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn topo_sort_environment_nodes_fails_on_cycle() {
        let config = parse_config(
            r#"{
                "workspace": { "setup": [] },
                "environment": {
                    "api": { "kind": "service", "runtime": "process", "command": "bun run api", "depends_on": ["db"] },
                    "db": { "kind": "service", "runtime": "process", "command": "bun run db", "depends_on": ["api"] }
                }
            }"#,
        );

        let graph = lower_environment_graph(&config, false, None, None).expect("graph lowers");
        let error =
            topo_sort_environment_nodes(&graph.environment_nodes).expect_err("cycle should fail");
        match error {
            LifecycleError::ServiceStartFailed { reason, .. } => {
                assert!(reason.contains("dependency cycle"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn lower_environment_graph_skips_ready_service_dependencies_for_targeted_boots() {
        let config = parse_config(
            r#"{
                "workspace": { "setup": [] },
                "environment": {
                    "api": {
                        "kind": "service",
                        "runtime": "process",
                        "command": "bun run api",
                        "depends_on": ["migrate"]
                    },
                    "migrate": {
                        "kind": "task",
                        "command": "bun run db:migrate",
                        "timeout_seconds": 60
                    },
                    "www": {
                        "kind": "service",
                        "runtime": "process",
                        "command": "bun run www",
                        "depends_on": ["api"]
                    }
                }
            }"#,
        );

        let satisfied_service_names = HashSet::from(["api".to_string()]);
        let graph = lower_environment_graph(
            &config,
            true,
            Some(&["www".to_string()]),
            Some(&satisfied_service_names),
        )
        .expect("graph lowers");

        let node_names = graph
            .environment_nodes
            .keys()
            .cloned()
            .collect::<BTreeSet<_>>();
        assert_eq!(node_names, BTreeSet::from(["www".to_string()]));
        assert_eq!(
            graph
                .environment_nodes
                .get("www")
                .expect("www present")
                .depends_on(),
            [] as [String; 0]
        );
    }
}
