import { describe, expect, test } from "bun:test";
import { parseManifest } from "./manifest";

const VALID_CONFIG = `{
  // One-time setup steps
  "setup": {
    "steps": [
      { "name": "install", "command": "bun install --frozen-lockfile", "timeout_seconds": 300 },
      { "name": "migrate", "command": "bun run db:migrate", "timeout_seconds": 120 },
    ],
  },
  "secrets": {
    "POSTGRES_PASSWORD": { "ref": "acme/dev/postgres_password", "required": true },
  },
  "services": {
    "postgres": {
      "runtime": "image",
      "image": "postgres:16-alpine",
      "startup_timeout_seconds": 45,
      "health_check": { "type": "tcp", "host": "127.0.0.1", "port": 5432, "timeout_seconds": 45 },
      "env_vars": {
        "POSTGRES_USER": "app",
        "POSTGRES_PASSWORD": "\${secrets.POSTGRES_PASSWORD}",
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
        "type": "http",
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
    expect(result.config.setup.steps).toHaveLength(2);
    expect(result.config.setup.steps[0]!.name).toBe("install");
    expect(Object.keys(result.config.services)).toEqual(["postgres", "api"]);
    expect(result.config.services["postgres"]!.runtime).toBe("image");
    expect(result.config.services["api"]!.runtime).toBe("process");
    expect(result.config.secrets?.["POSTGRES_PASSWORD"]?.required).toBe(true);
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

  test("validates health check types", () => {
    const result = parseManifest(`{
      "setup": { "steps": [{ "name": "a", "command": "b", "timeout_seconds": 10 }] },
      "services": {
        "api": {
          "runtime": "process",
          "command": "run",
          "health_check": { "type": "http", "url": "http://localhost:3000/health", "timeout_seconds": 30 }
        }
      }
    }`);
    expect(result.valid).toBe(true);
  });

  test("validates secret schema", () => {
    const result = parseManifest(`{
      "setup": { "steps": [{ "name": "a", "command": "b", "timeout_seconds": 10 }] },
      "services": { "api": { "runtime": "process", "command": "run" } },
      "secrets": { "KEY": { "ref": "org/key", "required": true } }
    }`);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.config.secrets?.["KEY"]?.ref).toBe("org/key");
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
});
