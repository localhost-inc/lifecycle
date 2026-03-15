import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getManifestFingerprint, parseManifest } from "./manifest";

const WORKSPACE_SLUG_TEMPLATE = "${LIFECYCLE_WORKSPACE_SLUG}";
const API_PORT_TEMPLATE = "${LIFECYCLE_SERVICE_API_PORT}";
const API_HOST_TEMPLATE = "${LIFECYCLE_SERVICE_API_HOST}";
const SECRET_API_KEY_TEMPLATE = "${secrets.API_KEY}";

const VALID_CONFIG = `{
  "workspace": {
    "setup": [
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
  "environment": {
    "postgres": {
      "kind": "service",
      "runtime": "image",
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
      "kind": "service",
      "runtime": "process",
      "command": "bun run dev:api",
      "cwd": "apps/api",
      "depends_on": ["migrate"],
      "port": 3001,
      "share_default": true,
      "health_check": {
        "kind": "http",
        "url": "http://127.0.0.1:3001/health",
        "timeout_seconds": 45
      }
    }
  }
}`;

describe("parseManifest", () => {
  test("parses valid JSONC config with graph-native environment nodes", () => {
    const result = parseManifest(VALID_CONFIG);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.config.workspace.setup).toHaveLength(2);
    expect(result.config.workspace.setup[0]!.name).toBe("install");
    expect(result.config.workspace.setup[1]!.run_on).toBe("start");
    expect(result.config.workspace.teardown?.[0]?.name).toBe("cleanup");
    expect(result.config.environment["postgres"]!.kind).toBe("service");
    expect(result.config.environment["migrate"]!.kind).toBe("task");
    expect(result.config.environment["api"]!.kind).toBe("service");
  });

  test("returns errors for missing required workspace field", () => {
    const result = parseManifest(`{
      "environment": {
        "api": { "kind": "service", "runtime": "process", "command": "run" }
      }
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(
      result.errors.some(
        (e) => e.path === "workspace" || e.message.toLowerCase().includes("required"),
      ),
    ).toBe(true);
  });

  test("returns errors for missing required environment field", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] }
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(
      result.errors.some(
        (e) => e.path === "environment" || e.message.toLowerCase().includes("required"),
      ),
    ).toBe(true);
  });

  test("returns errors for invalid field types", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": "not-a-number" }] },
      "environment": {}
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("returns errors when a workspace setup step omits both command and write_files", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "write-env", "timeout_seconds": 10 }] },
      "environment": {}
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.some((e) => e.path.includes("command"))).toBe(true);
  });

  test("accepts workspace setup steps that write files", () => {
    const result = parseManifest(`{
      "workspace": {
        "setup": [{
          "name": "write-env",
          "write_files": [{
            "path": "apps/api/.env.local",
            "lines": ["PORT=${API_PORT_TEMPLATE}", "HOST=${API_HOST_TEMPLATE}"]
          }],
          "timeout_seconds": 10,
          "run_on": "start"
        }]
      },
      "environment": {
        "api": { "kind": "service", "runtime": "process", "command": "bun run dev", "port": 3001 }
      }
    }`);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    const step = result.config.workspace.setup[0]!;
    expect(step.command).toBeUndefined();
    expect(step.write_files).toHaveLength(1);
    expect(step.write_files?.[0]?.path).toBe("apps/api/.env.local");
  });

  test("rejects workspace setup steps with depends_on", () => {
    const result = parseManifest(`{
      "workspace": {
        "setup": [{
          "name": "install",
          "command": "bun install",
          "timeout_seconds": 10,
          "depends_on": ["postgres"]
        }]
      },
      "environment": {
        "postgres": { "kind": "service", "runtime": "image", "image": "postgres:16" }
      }
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors).toEqual([
      {
        path: "workspace.setup.0.depends_on",
        message: "workspace.setup steps cannot declare depends_on",
      },
    ]);
  });

  test("rejects workspace teardown steps with run_on", () => {
    const result = parseManifest(`{
      "workspace": {
        "setup": [],
        "teardown": [{
          "name": "cleanup",
          "command": "rm -f .env.local",
          "timeout_seconds": 10,
          "run_on": "start"
        }]
      },
      "environment": {}
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
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "environment": {
        "postgres": { "kind": "service", "runtime": "image", "image": "postgres:16" },
        "migrate": {
          "kind": "task",
          "command": "bun run db:migrate",
          "depends_on": ["postgres"],
          "timeout_seconds": 60,
          "run_on": "start"
        }
      }
    }`);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.config.environment["migrate"]?.kind).toBe("task");
    if (result.config.environment["migrate"]?.kind !== "task") return;
    expect(result.config.environment["migrate"].depends_on).toEqual(["postgres"]);
    expect(result.config.environment["migrate"].run_on).toBe("start");
  });

  test("returns errors for invalid service runtime", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "environment": { "api": { "kind": "service", "runtime": "unknown", "command": "run" } }
    }`);
    expect(result.valid).toBe(false);
  });

  test("returns errors for process service missing command", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "environment": { "api": { "kind": "service", "runtime": "process" } }
    }`);
    expect(result.valid).toBe(false);
  });

  test("returns errors for image service missing image", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "environment": { "db": { "kind": "service", "runtime": "image" } }
    }`);
    expect(result.valid).toBe(false);
  });

  test("handles JSONC comments correctly", () => {
    const result = parseManifest(`{
      // This is a comment
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      /* Block comment */
      "environment": { "api": { "kind": "service", "runtime": "process", "command": "run" } }
    }`);
    expect(result.valid).toBe(true);
  });

  test("handles trailing commas", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10, },], },
      "environment": { "api": { "kind": "service", "runtime": "process", "command": "run", }, },
    }`);
    expect(result.valid).toBe(true);
  });

  test("returns error for empty string", () => {
    const result = parseManifest("");
    expect(result.valid).toBe(false);
  });

  test("returns error for invalid JSON", () => {
    const result = parseManifest("{bad json}");
    expect(result.valid).toBe(false);
  });

  test("validates health check kinds", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "environment": {
        "api": {
          "kind": "service",
          "runtime": "process",
          "command": "run",
          "health_check": { "kind": "http", "url": "http://localhost:3000/health", "timeout_seconds": 30 }
        }
      }
    }`);
    expect(result.valid).toBe(true);
  });

  test("accepts runtime templates in http health check urls", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "environment": {
        "web": {
          "kind": "service",
          "runtime": "process",
          "command": "run",
          "health_check": {
            "kind": "http",
            "url": "http://\${LIFECYCLE_SERVICE_WEB_ADDRESS}/@vite/client",
            "timeout_seconds": 30
          }
        }
      }
    }`);
    expect(result.valid).toBe(true);
  });

  test("accepts runtime templates in tcp health check ports", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "environment": {
        "redis": {
          "kind": "service",
          "runtime": "image",
          "image": "redis:7-alpine",
          "health_check": {
            "kind": "tcp",
            "host": "\${LIFECYCLE_SERVICE_REDIS_HOST}",
            "port": "\${LIFECYCLE_SERVICE_REDIS_PORT}",
            "timeout_seconds": 30
          }
        }
      }
    }`);
    expect(result.valid).toBe(true);
  });

  test("accepts container health checks", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "environment": {
        "postgres": {
          "kind": "service",
          "runtime": "image",
          "image": "postgres:16",
          "port": 5432,
          "health_check": {
            "kind": "container",
            "timeout_seconds": 30
          }
        }
      }
    }`);
    expect(result.valid).toBe(true);
  });

  test("rejects container health checks on process services", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "environment": {
        "api": {
          "kind": "service",
          "runtime": "process",
          "command": "run",
          "health_check": { "kind": "container", "timeout_seconds": 30 }
        }
      }
    }`);
    expect(result.valid).toBe(false);
  });

  test("accepts image services with build and volumes", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "environment": {
        "postgres": {
          "kind": "service",
          "runtime": "image",
          "build": { "context": "docker", "dockerfile": "docker/Dockerfile.pg.dev" },
          "volumes": [
            { "type": "volume", "source": "postgres", "target": "/var/lib/postgresql/data" },
            { "type": "bind", "source": "docker/init.sql", "target": "/docker-entrypoint-initdb.d/init.sql", "read_only": true }
          ]
        }
      }
    }`);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.config.environment["postgres"]!.kind).toBe("service");
    if (result.config.environment["postgres"]!.kind !== "service") return;
    expect(result.config.environment["postgres"]!.runtime).toBe("image");
    if (result.config.environment["postgres"]!.runtime !== "image") return;
    expect(result.config.environment["postgres"]!.build?.context).toBe("docker");
    expect(result.config.environment["postgres"]!.volumes).toHaveLength(2);
  });

  test("rejects invalid named volume sources", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "environment": {
        "postgres": {
          "kind": "service",
          "runtime": "image",
          "image": "postgres:16",
          "volumes": [
            { "type": "volume", "source": "../postgres", "target": "/var/lib/postgresql/data" }
          ]
        }
      }
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(
      result.errors.some(
        (error) =>
          error.path === "environment.postgres.volumes.0.source" &&
          error.message.includes("Named volumes must start"),
      ),
    ).toBe(true);
  });

  test("rejects managed secrets blocks", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "environment": { "api": { "kind": "service", "runtime": "process", "command": "run" } },
      "secrets": { "KEY": { "ref": "org/key", "required": true } }
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors).toEqual([
      {
        path: "secrets",
        message:
          "Managed secrets are not supported in local lifecycle.json yet. Materialize local env files in workspace setup instead.",
      },
    ]);
  });

  test("rejects `${secrets.*}` references in manifest strings", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "environment": {
        "api": {
          "kind": "service",
          "runtime": "process",
          "command": "run",
          "env": { "API_KEY": "${SECRET_API_KEY_TEMPLATE}" }
        }
      }
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors).toEqual([
      {
        path: "environment.api.env.API_KEY",
        message:
          "`${secrets.*}` is not supported in local lifecycle.json. Materialize local env files in workspace setup instead.",
      },
    ]);
  });

  test("rejects top-level reset blocks", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "environment": { "api": { "kind": "service", "runtime": "process", "command": "run" } },
      "reset": { "strategy": "reseed", "command": "bun run seed", "timeout_seconds": 60 }
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors).toEqual([
      {
        path: "reset",
        message:
          "`reset` is not part of the current lifecycle.json contract yet. Remove it from the manifest for now.",
      },
    ]);
  });

  test("rejects top-level mcps blocks", () => {
    const result = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "environment": { "api": { "kind": "service", "runtime": "process", "command": "run" } },
      "mcps": {
        "notion": {
          "command": "npx",
          "args": ["-y", "@notionhq/notion-mcp-server"],
          "transport": "stdio"
        }
      }
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors).toEqual([
      {
        path: "mcps",
        message:
          "`mcps` is not part of the current lifecycle.json contract yet. Remove it from the manifest for now.",
      },
    ]);
  });

  test("keeps the checked-in repo lifecycle.json valid", () => {
    const manifestPath = new URL("../../../lifecycle.json", import.meta.url);
    const result = parseManifest(readFileSync(manifestPath, "utf8"));

    expect(result.valid).toBe(true);
    if (!result.valid) {
      expect(result.errors).toEqual([]);
    }
  });

  test("produces a stable fingerprint independent of object key order", () => {
    const left = parseManifest(`{
      "workspace": { "setup": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "environment": {
        "web": {
          "kind": "service",
          "runtime": "process",
          "command": "bun run dev",
          "port": 3000,
          "env": { "B": "2", "A": "1" }
        },
        "migrate": {
          "kind": "task",
          "command": "bun run db:migrate",
          "depends_on": ["web"],
          "timeout_seconds": 30
        }
      }
    }`);
    const right = parseManifest(`{
      "environment": {
        "migrate": {
          "timeout_seconds": 30,
          "depends_on": ["web"],
          "command": "bun run db:migrate",
          "kind": "task"
        },
        "web": {
          "env": { "A": "1", "B": "2" },
          "port": 3000,
          "command": "bun run dev",
          "runtime": "process",
          "kind": "service"
        }
      },
      "workspace": { "setup": [{ "timeout_seconds": 10, "command": "bun install", "name": "install" }] }
    }`);

    expect(left.valid).toBe(true);
    expect(right.valid).toBe(true);
    if (!left.valid || !right.valid) return;

    expect(getManifestFingerprint(left.config)).toBe(getManifestFingerprint(right.config));
  });
});
