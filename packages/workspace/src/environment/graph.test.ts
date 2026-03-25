import { describe, expect, test } from "bun:test";
import { parseManifest, type LifecycleConfig } from "@lifecycle/contracts";
import {
  declaredServiceNames,
  GraphError,
  lowerEnvironmentGraph,
  resolveStartOrder,
  topologicalSort,
} from "./graph";

function parse(json: string): LifecycleConfig {
  const result = parseManifest(json);
  if (!result.valid) throw new Error(result.errors.map((e) => e.message).join(", "));
  return result.config;
}

describe("lowerEnvironmentGraph", () => {
  test("lowers workspace prepare and environment nodes", () => {
    const config = parse(`{
      "workspace": {
        "prepare": [
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
    }`);

    const graph = lowerEnvironmentGraph(config, { prepared: false });

    expect(graph.prepareSteps).toHaveLength(2);
    expect(graph.nodes.get("api")?.kind).toBe("service");
    expect(graph.nodes.get("migrate")?.kind).toBe("task");
  });

  test("filters create-scoped nodes after first successful start", () => {
    const config = parse(`{
      "workspace": {
        "prepare": [
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
    }`);

    const graph = lowerEnvironmentGraph(config, { prepared: true });

    expect(graph.prepareSteps).toHaveLength(0);
    expect(graph.nodes.has("seed")).toBe(false);
    expect(graph.nodes.has("migrate")).toBe(true);
  });

  test("treats skipped create tasks as satisfied dependencies", () => {
    const config = parse(`{
      "workspace": { "prepare": [] },
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
    }`);

    const graph = lowerEnvironmentGraph(config, { prepared: true });

    expect(graph.nodes.has("seed")).toBe(false);
    expect(graph.nodes.get("api")?.dependsOn).toEqual(["postgres"]);
  });

  test("selects a service and its transitive dependencies", () => {
    const config = parse(`{
      "workspace": { "prepare": [] },
      "environment": {
        "api": { "kind": "service", "runtime": "process", "command": "bun run api" },
        "www": { "kind": "service", "runtime": "process", "command": "bun run www", "depends_on": ["api"] },
        "docs": { "kind": "service", "runtime": "process", "command": "bun run docs" }
      }
    }`);

    const graph = lowerEnvironmentGraph(config, {
      prepared: false,
      targetServices: ["www"],
    });

    const names = [...graph.nodes.keys()].sort();
    expect(names).toEqual(["api", "www"]);
  });

  test("rejects unknown selected services", () => {
    const config = parse(`{
      "workspace": { "prepare": [] },
      "environment": {
        "api": { "kind": "service", "runtime": "process", "command": "bun run api" }
      }
    }`);

    expect(() =>
      lowerEnvironmentGraph(config, {
        prepared: false,
        targetServices: ["www"],
      }),
    ).toThrow(GraphError);
  });

  test("fails when dependency is missing", () => {
    const config = parse(`{
      "workspace": { "prepare": [] },
      "environment": {
        "api": {
          "kind": "service",
          "runtime": "process",
          "command": "bun run api",
          "depends_on": ["postgres"]
        }
      }
    }`);

    expect(() =>
      lowerEnvironmentGraph(config, { prepared: false }),
    ).toThrow(/depends on missing node/);
  });

  test("skips already-running services for targeted starts", () => {
    const config = parse(`{
      "workspace": { "prepare": [] },
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
    }`);

    const graph = lowerEnvironmentGraph(config, {
      prepared: true,
      targetServices: ["www"],
      satisfiedServices: new Set(["api"]),
    });

    const names = [...graph.nodes.keys()];
    expect(names).toEqual(["www"]);
    expect(graph.nodes.get("www")?.dependsOn).toEqual([]);
  });
});

describe("topologicalSort", () => {
  test("orders dependencies before dependents", () => {
    const config = parse(`{
      "workspace": { "prepare": [] },
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
    }`);

    const graph = lowerEnvironmentGraph(config, { prepared: false });
    const sorted = topologicalSort(graph.nodes);
    const names = sorted.map((n) => n.name);

    const indexOf = (name: string) => names.indexOf(name);
    expect(indexOf("postgres")).toBeLessThan(indexOf("migrate"));
    expect(indexOf("migrate")).toBeLessThan(indexOf("api"));
    expect(indexOf("api")).toBeLessThan(indexOf("web"));
  });

  test("fails on cycle", () => {
    const config = parse(`{
      "workspace": { "prepare": [] },
      "environment": {
        "api": { "kind": "service", "runtime": "process", "command": "bun run api", "depends_on": ["db"] },
        "db": { "kind": "service", "runtime": "process", "command": "bun run db", "depends_on": ["api"] }
      }
    }`);

    const graph = lowerEnvironmentGraph(config, { prepared: false });
    expect(() => topologicalSort(graph.nodes)).toThrow(/dependency cycle/);
  });

  test("deterministic ordering for independent nodes", () => {
    const config = parse(`{
      "workspace": { "prepare": [] },
      "environment": {
        "charlie": { "kind": "service", "runtime": "process", "command": "c" },
        "alpha": { "kind": "service", "runtime": "process", "command": "a" },
        "bravo": { "kind": "service", "runtime": "process", "command": "b" }
      }
    }`);

    const graph = lowerEnvironmentGraph(config, { prepared: false });
    const sorted = topologicalSort(graph.nodes);
    const names = sorted.map((n) => n.name);

    expect(names).toEqual(["alpha", "bravo", "charlie"]);
  });
});

describe("resolveStartOrder", () => {
  test("combines lowering and sorting", () => {
    const config = parse(`{
      "workspace": {
        "prepare": [
          { "name": "install", "command": "bun install", "timeout_seconds": 60 }
        ]
      },
      "environment": {
        "api": { "kind": "service", "runtime": "process", "command": "bun run api" },
        "www": { "kind": "service", "runtime": "process", "command": "bun run www", "depends_on": ["api"] }
      }
    }`);

    const { prepareSteps, sorted } = resolveStartOrder(config, { prepared: false });

    expect(prepareSteps).toHaveLength(1);
    expect(sorted.map((n) => n.name)).toEqual(["api", "www"]);
  });
});

describe("declaredServiceNames", () => {
  test("returns only service nodes, not tasks", () => {
    const config = parse(`{
      "workspace": { "prepare": [] },
      "environment": {
        "api": { "kind": "service", "runtime": "process", "command": "bun run api" },
        "migrate": { "kind": "task", "command": "bun run db:migrate", "timeout_seconds": 60 },
        "www": { "kind": "service", "runtime": "process", "command": "bun run www" }
      }
    }`);

    expect(declaredServiceNames(config).sort()).toEqual(["api", "www"]);
  });
});
