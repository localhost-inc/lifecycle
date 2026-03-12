import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getManifestFingerprint, parseManifest } from "./manifest";

const VALID_CONFIG = `{
  // One-time setup steps
  "setup": {
    "services": ["postgres"],
    "steps": [
      { "name": "install", "command": "bun install --frozen-lockfile", "timeout_seconds": 300 },
      {
        "name": "write-api-env",
        "write_files": [{
          "path": "apps/api/.env.local",
          "lines": [
            "DATABASE_URL=postgres://app:app@127.0.0.1:\${LIFECYCLE_SERVICE_POSTGRES_PORT}/app",
          ],
        }],
        "timeout_seconds": 10,
        "run_on": "start",
      },
      { "name": "migrate", "command": "bun run db:migrate", "timeout_seconds": 120, "run_on": "start" },
    ],
  },
  "services": {
    "postgres": {
      "runtime": "image",
      "image": "postgres:16-alpine",
      "startup_timeout_seconds": 45,
      "health_check": { "kind": "tcp", "host": "127.0.0.1", "port": 5432, "timeout_seconds": 45 },
      "env_vars": {
        "POSTGRES_USER": "app",
        "POSTGRES_PASSWORD": "app",
      },
    },
    "api": {
      "runtime": "process",
      "command": "bun run dev:api",
      "cwd": "apps/api",
      "depends_on": ["postgres"],
      "port": 3001,
      "share_default": true,
      "health_check": {
        "kind": "http",
        "url": "http://127.0.0.1:3001/health",
        "timeout_seconds": 45,
      },
    },
  },
  "mcps": {
    "notion": {
      "command": "npx",
      "args": ["-y", "@notionhq/notion-mcp-server"],
      "transport": "stdio",
    },
  },
}`;

describe("parseManifest", () => {
  test("parses valid JSONC config with comments and trailing commas", () => {
    const result = parseManifest(VALID_CONFIG);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.config.setup.services).toEqual(["postgres"]);
    expect(result.config.setup.steps).toHaveLength(3);
    expect(result.config.setup.steps[0]!.name).toBe("install");
    expect(result.config.setup.steps[1]!.run_on).toBe("start");
    expect(result.config.setup.steps[1]!.write_files?.[0]?.path).toBe("apps/api/.env.local");
    expect(Object.keys(result.config.services)).toEqual(["postgres", "api"]);
    expect(result.config.services["postgres"]!.runtime).toBe("image");
    expect(result.config.services["api"]!.runtime).toBe("process");
    expect(result.config.mcps?.["notion"]?.transport).toBe("stdio");
  });

  test("returns errors for missing required setup field", () => {
    const result = parseManifest(`{
      "services": { "api": { "runtime": "process", "command": "run" } }
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(
      result.errors.some((e) => e.path === "setup" || e.message.toLowerCase().includes("required")),
    ).toBe(true);
  });

  test("returns errors for missing required services field", () => {
    const result = parseManifest(`{
      "setup": { "steps": [{ "name": "a", "command": "b", "timeout_seconds": 10 }] }
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(
      result.errors.some(
        (e) => e.path === "services" || e.message.toLowerCase().includes("required"),
      ),
    ).toBe(true);
  });

  test("returns errors for invalid field types", () => {
    const result = parseManifest(`{
      "setup": { "steps": [{ "name": "a", "command": "b", "timeout_seconds": "not-a-number" }] },
      "services": {}
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("returns errors for empty steps array", () => {
    const result = parseManifest(`{
      "setup": { "steps": [] },
      "services": {}
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.some((e) => e.path.includes("steps"))).toBe(true);
  });

  test("returns errors when a setup step omits both command and write_files", () => {
    const result = parseManifest(`{
      "setup": { "steps": [{ "name": "a", "timeout_seconds": 10 }] },
      "services": {}
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.some((e) => e.path.includes("command"))).toBe(true);
  });

  test("accepts setup steps that write files", () => {
    const result = parseManifest(`{
      "setup": {
        "steps": [{
          "name": "write-env",
          "write_files": [{
            "path": "apps/api/.env.local",
            "lines": ["PORT=\${LIFECYCLE_SERVICE_API_PORT}", "HOST=\${LIFECYCLE_SERVICE_API_HOST}"]
          }],
          "timeout_seconds": 10,
          "run_on": "start"
        }]
      },
      "services": {
        "api": { "runtime": "process", "command": "bun run dev", "port": 3001 }
      }
    }`);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    const step = result.config.setup.steps[0]!;
    expect(step.command).toBeUndefined();
    expect(step.write_files).toHaveLength(1);
    expect(step.write_files?.[0]?.path).toBe("apps/api/.env.local");
  });

  test("returns errors for invalid service runtime", () => {
    const result = parseManifest(`{
      "setup": { "steps": [{ "name": "a", "command": "b", "timeout_seconds": 10 }] },
      "services": { "api": { "runtime": "unknown", "command": "run" } }
    }`);
    expect(result.valid).toBe(false);
  });

  test("returns errors for process service missing command", () => {
    const result = parseManifest(`{
      "setup": { "steps": [{ "name": "a", "command": "b", "timeout_seconds": 10 }] },
      "services": { "api": { "runtime": "process" } }
    }`);
    expect(result.valid).toBe(false);
  });

  test("returns errors for image service missing image", () => {
    const result = parseManifest(`{
      "setup": { "steps": [{ "name": "a", "command": "b", "timeout_seconds": 10 }] },
      "services": { "db": { "runtime": "image" } }
    }`);
    expect(result.valid).toBe(false);
  });

  test("handles JSONC comments correctly", () => {
    const result = parseManifest(`{
      // This is a comment
      "setup": { "steps": [{ "name": "a", "command": "b", "timeout_seconds": 10 }] },
      /* Block comment */
      "services": { "api": { "runtime": "process", "command": "run" } }
    }`);
    expect(result.valid).toBe(true);
  });

  test("handles trailing commas", () => {
    const result = parseManifest(`{
      "setup": { "steps": [{ "name": "a", "command": "b", "timeout_seconds": 10, },], },
      "services": { "api": { "runtime": "process", "command": "run", }, },
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
      "setup": { "steps": [{ "name": "a", "command": "b", "timeout_seconds": 10 }] },
      "services": {
        "api": {
          "runtime": "process",
          "command": "run",
          "health_check": { "kind": "http", "url": "http://localhost:3000/health", "timeout_seconds": 30 }
        }
      }
    }`);
    expect(result.valid).toBe(true);
  });

  test("accepts image services with build and volumes", () => {
    const result = parseManifest(`{
      "setup": { "steps": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "services": {
        "postgres": {
          "runtime": "image",
          "build": { "context": "docker", "dockerfile": "docker/Dockerfile.pg.dev" },
          "volumes": [
            { "source": "workspace://postgres", "target": "/var/lib/postgresql/data" },
            { "source": "docker/init.sql", "target": "/docker-entrypoint-initdb.d/init.sql", "read_only": true }
          ]
        }
      }
    }`);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.config.services["postgres"]!.runtime).toBe("image");
    if (result.config.services["postgres"]!.runtime !== "image") return;
    expect(result.config.services["postgres"]!.build?.context).toBe("docker");
    expect(result.config.services["postgres"]!.volumes).toHaveLength(2);
  });

  test("rejects managed secrets blocks", () => {
    const result = parseManifest(`{
      "setup": { "steps": [{ "name": "a", "command": "b", "timeout_seconds": 10 }] },
      "services": { "api": { "runtime": "process", "command": "run" } },
      "secrets": { "KEY": { "ref": "org/key", "required": true } }
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors).toEqual([
      {
        path: "secrets",
        message:
          "Managed secrets are not supported in local lifecycle.json yet. Materialize local env files in setup instead.",
      },
    ]);
  });

  test("rejects `${secrets.*}` references in manifest strings", () => {
    const result = parseManifest(`{
      "setup": { "steps": [{ "name": "a", "command": "b", "timeout_seconds": 10 }] },
      "services": {
        "api": {
          "runtime": "process",
          "command": "run",
          "env_vars": { "API_KEY": "\${secrets.API_KEY}" }
        }
      }
    }`);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors).toEqual([
      {
        path: "services.api.env_vars.API_KEY",
        message:
          "`${secrets.*}` is not supported in local lifecycle.json. Materialize local env files in setup instead.",
      },
    ]);
  });

  test("validates optional reset field", () => {
    const result = parseManifest(`{
      "setup": { "steps": [{ "name": "a", "command": "b", "timeout_seconds": 10 }] },
      "services": { "api": { "runtime": "process", "command": "run" } },
      "reset": { "strategy": "reseed", "command": "bun run seed", "timeout_seconds": 60 }
    }`);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.config.reset?.strategy).toBe("reseed");
  });

  test("accepts setup services for infra required before setup steps", () => {
    const result = parseManifest(`{
      "setup": {
        "services": ["postgres", "redis"],
        "steps": [{ "name": "migrate", "command": "bun run db:migrate", "timeout_seconds": 60, "run_on": "start" }]
      },
      "services": {
        "postgres": { "runtime": "image", "image": "postgres:16" },
        "redis": { "runtime": "image", "image": "redis:7" },
        "api": { "runtime": "process", "command": "bun run dev", "depends_on": ["postgres", "redis"] }
      }
    }`);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.config.setup.services).toEqual(["postgres", "redis"]);
    expect(result.config.setup.steps[0]!.run_on).toBe("start");
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
      "setup": { "steps": [{ "name": "install", "command": "bun install", "timeout_seconds": 10 }] },
      "services": {
        "web": { "runtime": "process", "command": "bun run dev", "port": 3000, "env_vars": { "B": "2", "A": "1" } },
        "api": { "runtime": "process", "command": "bun run api", "depends_on": ["web"] }
      }
    }`);
    const right = parseManifest(`{
      "services": {
        "api": { "depends_on": ["web"], "command": "bun run api", "runtime": "process" },
        "web": { "env_vars": { "A": "1", "B": "2" }, "port": 3000, "command": "bun run dev", "runtime": "process" }
      },
      "setup": { "steps": [{ "timeout_seconds": 10, "command": "bun install", "name": "install" }] }
    }`);

    expect(left.valid).toBe(true);
    expect(right.valid).toBe(true);
    if (!left.valid || !right.valid) return;

    expect(getManifestFingerprint(left.config)).toBe(getManifestFingerprint(right.config));
  });
});
