import type { LifecycleConfig } from "@lifecycle/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StackNodeKind = "task" | "service";

export interface StackNode {
  name: string;
  kind: StackNodeKind;
  dependsOn: string[];
}

export interface LoweredGraph {
  /** Workspace prepare steps that should run (filtered by `prepared` / `runOn`). */
  prepareSteps: Array<{ name: string; runOn?: "create" | "start" }>;
  /** Environment nodes included in this start, with resolved dependencies. */
  nodes: Map<string, StackNode>;
}

export interface LowerOptions {
  /** True after the workspace has completed its first successful start. */
  prepared: boolean;
  /** Restrict start to these service names (+ their transitive deps). */
  targetServices?: string[];
  /** Services that are already running — treated as satisfied. */
  satisfiedServices?: Set<string>;
}

export class GraphError extends Error {
  constructor(
    message: string,
    public readonly node?: string,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nodeKind(node: LifecycleConfig["stack"][string]): StackNodeKind {
  return node.kind === "task" ? "task" : "service";
}

function nodeDependsOn(node: LifecycleConfig["stack"][string]): string[] {
  return node.depends_on ?? [];
}

function shouldRun(runOn: "create" | "start" | undefined, prepared: boolean): boolean {
  if (runOn === "start") return true;
  return !prepared;
}

// ---------------------------------------------------------------------------
// Transitive dependency collection
// ---------------------------------------------------------------------------

function collectTransitiveDeps(
  stack: LifecycleConfig["stack"],
  name: string,
  selected: Set<string>,
  satisfied: Set<string>,
): void {
  const node = stack[name];
  if (!node) {
    throw new GraphError(`node '${name}' is not declared in stack`, name);
  }

  if (nodeKind(node) === "service" && satisfied.has(name)) return;
  if (selected.has(name)) return;
  selected.add(name);

  for (const dep of nodeDependsOn(node)) {
    collectTransitiveDeps(stack, dep, selected, satisfied);
  }
}

// ---------------------------------------------------------------------------
// Lower
// ---------------------------------------------------------------------------

export function lowerStackGraph(config: LifecycleConfig, options: LowerOptions): LoweredGraph {
  const { prepared, satisfiedServices } = options;
  const satisfied = satisfiedServices ?? new Set<string>();

  // Resolve which nodes to include when targeting specific services.
  let selectedNames: Set<string> | null = null;
  if (options.targetServices && options.targetServices.length > 0) {
    selectedNames = new Set<string>();
    for (const name of options.targetServices) {
      const node = config.stack[name];
      if (!node) {
        throw new GraphError(`unknown service '${name}'`, name);
      }
      if (nodeKind(node) !== "service") {
        throw new GraphError(`'${name}' is not a service node`, name);
      }
      collectTransitiveDeps(config.stack, name, selectedNames, satisfied);
    }
  }

  // Build the set of satisfied/skipped nodes.
  const satisfiedNodes = new Set<string>(satisfied);
  for (const [name, node] of Object.entries(config.stack)) {
    if (node.kind === "task" && !shouldRun(node.run_on, prepared)) {
      satisfiedNodes.add(name);
    }
  }

  // Filter workspace prepare steps.
  const prepareSteps: LoweredGraph["prepareSteps"] = config.workspace.prepare
    .filter((step) => shouldRun(step.run_on, prepared))
    .map((step) => ({ name: step.name, ...(step.run_on ? { runOn: step.run_on } : {}) }));

  // Build stack nodes.
  const nodes = new Map<string, StackNode>();

  for (const [name, nodeConfig] of Object.entries(config.stack)) {
    if (selectedNames && !selectedNames.has(name)) continue;

    const kind = nodeKind(nodeConfig);

    if (nodeConfig.kind === "task" && !shouldRun(nodeConfig.run_on, prepared)) continue;

    const dependsOn = nodeDependsOn(nodeConfig).filter((dep) => !satisfiedNodes.has(dep));

    nodes.set(name, { name, kind, dependsOn });
  }

  // Validate all referenced dependencies exist in the graph.
  for (const [name, node] of nodes) {
    for (const dep of node.dependsOn) {
      if (!nodes.has(dep)) {
        throw new GraphError(`node '${name}' depends on missing node '${dep}'`, name);
      }
    }
  }

  return { prepareSteps, nodes };
}

// ---------------------------------------------------------------------------
// Topological sort (Kahn's algorithm)
// ---------------------------------------------------------------------------

export function topologicalSort(nodes: Map<string, StackNode>): StackNode[] {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const name of nodes.keys()) {
    inDegree.set(name, 0);
  }

  for (const [name, node] of nodes) {
    for (const dep of node.dependsOn) {
      if (!nodes.has(dep)) {
        throw new GraphError(`node '${name}' depends on missing node '${dep}'`, name);
      }
      const list = dependents.get(dep);
      if (list) {
        list.push(name);
      } else {
        dependents.set(dep, [name]);
      }
      inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
    }
  }

  // Use a sorted array for deterministic ordering (alphabetical tiebreaker).
  const ready: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) ready.push(name);
  }
  ready.sort();

  const result: StackNode[] = [];

  while (ready.length > 0) {
    const name = ready.shift()!;
    result.push(nodes.get(name)!);

    const deps = dependents.get(name);
    if (deps) {
      for (const next of deps) {
        const d = (inDegree.get(next) ?? 1) - 1;
        inDegree.set(next, d);
        if (d === 0) {
          // Insert in sorted position for deterministic order.
          const idx = ready.findIndex((r) => r > next);
          if (idx === -1) ready.push(next);
          else ready.splice(idx, 0, next);
        }
      }
    }
  }

  if (result.length !== nodes.size) {
    const sorted = new Set(result.map((n) => n.name));
    const unresolved = [...nodes.keys()].filter((n) => !sorted.has(n)).sort();
    throw new GraphError(`dependency cycle detected: ${unresolved.join(", ")}`, unresolved[0]);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Convenience: lower + sort in one call
// ---------------------------------------------------------------------------

export function resolveStartOrder(
  config: LifecycleConfig,
  options: LowerOptions,
): { prepareSteps: LoweredGraph["prepareSteps"]; sorted: StackNode[] } {
  const graph = lowerStackGraph(config, options);
  const sorted = topologicalSort(graph.nodes);
  return { prepareSteps: graph.prepareSteps, sorted };
}

// ---------------------------------------------------------------------------
// Utility: extract declared service names from a config
// ---------------------------------------------------------------------------

export function declaredServiceNames(config: LifecycleConfig): string[] {
  return Object.entries(config.stack)
    .filter(([, node]) => nodeKind(node) === "service")
    .map(([name]) => name);
}
