import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getManifestFingerprint, parseManifest } from "./manifest";

const WORKSPACE_SLUG_TEMPLATE = "${LIFECYCLE_WORKSPACE_SLUG}";
const API_PORT_TEMPLATE = "${LIFECYCLE_SERVICE_API_PORT}";
const API_HOST_TEMPLATE = "${LIFECYCLE_SERVICE_API_HOST}";
const SECRET_API_KEY_TEMPLATE = "${secrets.API_KEY}";

const VALID_CONFIG = `{
  "workspace": {
    "prepare": [
      { "name": "install", "command": "bun install --frozen-lockfile", "timeout_seconds": 300 },
      {
        "name": "write-root-env",
        "write_files": [{
          "path": ".env.local",
          "lines": ["WORKSPACE=${WORKSPACE_SLUG_TEMPLATE}"]
        }],
        "timeout_seconds": 10,
        "run_on": "start"
      }
    ],
    "teardown": [
      { "name": "cleanup", "command": "rm -f .env.local", "timeout_seconds": 10 }
    ]
  },
  "stack": {
    "nodes": {
      "postgres": {
        "kind": "image",
        "image": "postgres:16-alpine",
        "startup_timeout_seconds": 45,
        "health_check": { "kind": "tcp", "host": "127.0.0.1", "port": 5432, "timeout_seconds": 45 },
        "env": {
          "POSTGRES_USER": "app",
          "POSTGRES_PASSWORD": "app"
        }
      },
      "migrate": {
        "kind": "task",
        "command": "bun run db:migrate",
        "depends_on": ["postgres"],
        "timeout_seconds": 120,
        "run_on": "start"
      },
      "api": {
        "kind": "process",
        "command": "bun run dev:api",
        "cwd": "apps/control-plane",
        "depends_on": ["migrate"],
        "health_check": {
          "kind": "http",
          "url": "http://127.0.0.1:3001/health",
          "timeout_seconds": 45
        }
      }
    }
  }
}`;

describe("parseManifest", () => {
  test("parses valid JSONC config with workspace steps and stack nodes", () => {
    const result = parseManifest(VALID_CONFIG);
    expect(result.valid).toBe(true);
    if (!result.valid) return;

    expect(result.config.workspace.prepare).toHaveLength(2);
    expect(result.config.workspace.prepare[0]!.name).toBe("install");
    expect(result.config.workspace.prepare[1]!.run_on).toBe("start");
    expect(result.config.workspace.teardown?.[0]?.name).toBe("cleanup");
    expect(result.config.stack?.nodes.postgres?.kind).toBe("image");
    expect(result.config.stack?.nodes.migrate?.kind).toBe("task");
    expect(result.config.stack?.nodes.api?.kind).toBe("process");
  });

  test("requires workspace and allows omitting stack", () => {
    const missingWorkspace = parseManifest(`{
      "stack": { "nodes": {} }
    }`);
    expect(missingWorkspace.valid).toBe(false);

    const missingStack = parseManifest(`{
      "workspace": { "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] }
    }`);
    expect(missingStack.valid).toBe(true);
    if (!missingStack.valid) return;
    expect(missingStack.config.stack).toBeUndefined();
  });

  test("returns errors for invalid field types", () => {
    const result = parseManifest(`{
      "workspace": { "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": "not-a-number" }] },
      "stack": { "nodes": {} }
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("requires exactly one of command or write_files for workspace steps", () => {
    const result = parseManifest(`{
      "workspace": { "prepare": [{ "name": "write-env", "timeout_seconds": 10 }] },
      "stack": { "nodes": {} }
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.some((error) => error.path.includes("command"))).toBe(true);
  });

  test("accepts workspace prepare steps that write files", () => {
    const result = parseManifest(`{
      "workspace": {
        "prepare": [{
          "name": "write-env",
          "write_files": [{
            "path": "apps/control-plane/.env.local",
            "lines": ["PORT=${API_PORT_TEMPLATE}", "HOST=${API_HOST_TEMPLATE}"]
          }],
          "timeout_seconds": 10,
          "run_on": "start"
        }]
      },
      "stack": {
        "nodes": {
          "api": { "kind": "process", "command": "bun run dev" }
        }
      }
    }`);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.config.workspace.prepare[0]?.write_files?.[0]?.path).toBe(
      "apps/control-plane/.env.local",
    );
  });

  test("rejects workspace prepare steps with depends_on", () => {
    const result = parseManifest(`{
      "workspace": {
        "prepare": [{
          "name": "install",
          "command": "bun install",
          "timeout_seconds": 10,
          "depends_on": ["postgres"]
        }]
      },
      "stack": {
        "nodes": {
          "postgres": { "kind": "image", "image": "postgres:16" }
        }
      }
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors).toEqual([
      {
        path: "workspace.prepare.0.depends_on",
        message: "workspace.prepare steps cannot declare depends_on",
      },
    ]);
  });

  test("rejects workspace teardown steps with run_on", () => {
    const result = parseManifest(`{
      "workspace": {
        "prepare": [],
        "teardown": [{
          "name": "cleanup",
          "command": "rm -f .env.local",
          "timeout_seconds": 10,
          "run_on": "start"
        }]
      },
      "stack": { "nodes": {} }
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors).toEqual([
      {
        path: "workspace.teardown.0.run_on",
        message: "workspace.teardown steps cannot declare run_on",
      },
    ]);
  });

  test("accepts task nodes with depends_on and run_on", () => {
    const result = parseManifest(`{
      "workspace": { "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "stack": {
        "nodes": {
          "postgres": { "kind": "image", "image": "postgres:16" },
          "migrate": {
            "kind": "task",
            "command": "bun run db:migrate",
            "depends_on": ["postgres"],
            "timeout_seconds": 60,
            "run_on": "start"
          }
        }
      }
    }`);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    const stackNodes = result.config.stack?.nodes;
    expect(stackNodes?.migrate?.kind).toBe("task");
    if (!stackNodes || stackNodes.migrate?.kind !== "task") return;
    expect(stackNodes.migrate.depends_on).toEqual(["postgres"]);
    expect(stackNodes.migrate.run_on).toBe("start");
  });

  test("rejects invalid node kinds or missing required fields", () => {
    const invalidKind = parseManifest(`{
      "workspace": { "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "stack": { "nodes": { "api": { "kind": "service", "command": "run" } } }
    }`);
    expect(invalidKind.valid).toBe(false);

    const processMissingCommand = parseManifest(`{
      "workspace": { "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "stack": { "nodes": { "api": { "kind": "process" } } }
    }`);
    expect(processMissingCommand.valid).toBe(false);

    const imageMissingSource = parseManifest(`{
      "workspace": { "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "stack": { "nodes": { "db": { "kind": "image" } } }
    }`);
    expect(imageMissingSource.valid).toBe(false);
  });

  test("rejects container health checks on process nodes", () => {
    const result = parseManifest(`{
      "workspace": { "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "stack": {
        "nodes": {
          "api": {
            "kind": "process",
            "command": "bun run dev",
            "health_check": { "kind": "container", "timeout_seconds": 10 }
          }
        }
      }
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors).toContainEqual({
      path: "stack.nodes.api.health_check.kind",
      message: 'Container health checks are only valid for kind: "image" nodes',
    });
  });

  test("accepts image nodes with build and volumes", () => {
    const result = parseManifest(`{
      "workspace": { "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "stack": {
        "nodes": {
          "postgres": {
            "kind": "image",
            "build": { "context": "docker" },
            "volumes": [
              { "type": "bind", "source": "./data", "target": "/data" },
              { "type": "volume", "source": "pg_data", "target": "/var/lib/postgresql/data" }
            ]
          }
        }
      }
    }`);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    const stackNodes = result.config.stack?.nodes;
    expect(stackNodes?.postgres?.kind).toBe("image");
    if (!stackNodes || stackNodes.postgres?.kind !== "image") return;
    expect(stackNodes.postgres.build?.context).toBe("docker");
    expect(stackNodes.postgres.volumes).toHaveLength(2);
  });

  test("handles JSONC comments and trailing commas", () => {
    const comments = parseManifest(`{
      // This is a comment
      "workspace": { "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      /* Block comment */
      "stack": { "nodes": { "api": { "kind": "process", "command": "run" } } }
    }`);
    expect(comments.valid).toBe(true);

    const trailing = parseManifest(`{
      "workspace": { "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": 10, },], },
      "stack": { "nodes": { "api": { "kind": "process", "command": "run", }, }, },
    }`);
    expect(trailing.valid).toBe(true);
  });

  test("returns errors for empty and malformed input", () => {
    expect(parseManifest("").valid).toBe(false);
    expect(parseManifest("{bad json}").valid).toBe(false);
  });

  test("rejects unsupported secrets, reset, and mcps", () => {
    const secrets = parseManifest(`{
      "secrets": { "API_KEY": "dev" },
      "workspace": { "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "stack": { "nodes": { "api": { "kind": "process", "command": "run" } } }
    }`);
    expect(secrets.valid).toBe(false);
    if (!secrets.valid) {
      expect(secrets.errors).toContainEqual({
        path: "secrets",
        message:
          "Managed secrets are not supported in local lifecycle.json yet. Materialize local env files in workspace prepare instead.",
      });
    }

    const secretTemplate = parseManifest(`{
      "workspace": { "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "stack": {
        "nodes": {
          "api": {
            "kind": "process",
            "command": "run",
            "env": { "API_KEY": "${SECRET_API_KEY_TEMPLATE}" }
          }
        }
      }
    }`);
    expect(secretTemplate.valid).toBe(false);

    const reset = parseManifest(`{
      "reset": { "command": "git clean -fdx" },
      "workspace": { "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "stack": { "nodes": { "api": { "kind": "process", "command": "run" } } }
    }`);
    expect(reset.valid).toBe(false);

    const mcps = parseManifest(`{
      "mcps": { "openai": {} },
      "workspace": { "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "stack": { "nodes": { "api": { "kind": "process", "command": "run" } } }
    }`);
    expect(mcps.valid).toBe(false);
  });

  test("keeps the checked-in repo lifecycle.json valid", () => {
    const manifestPath = new URL("../../../lifecycle.json", import.meta.url);
    const result = parseManifest(readFileSync(manifestPath, "utf8"));
    expect(result.valid).toBe(true);
  });
});

describe("getManifestFingerprint", () => {
  test("is stable regardless of key ordering", () => {
    const left = parseManifest(`{
      "workspace": { "prepare": [{ "timeout_seconds": 10, "command": "bun install", "name": "install" }] },
      "stack": {
        "nodes": {
          "api": { "kind": "process", "command": "bun run dev", "cwd": "apps/api" }
        }
      }
    }`);
    const right = parseManifest(`{
      "stack": {
        "nodes": {
          "api": { "cwd": "apps/api", "command": "bun run dev", "kind": "process" }
        }
      },
      "workspace": { "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] }
    }`);

    expect(left.valid).toBe(true);
    expect(right.valid).toBe(true);
    if (!left.valid || !right.valid) return;
    expect(getManifestFingerprint(left.config)).toBe(getManifestFingerprint(right.config));
  });
});
