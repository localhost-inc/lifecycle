import { describe, expect, test } from "bun:test";
import {
  buildStackEnv,
  expandRuntimeTemplates,
  injectAssignedPortsIntoManifest,
  previewUrlForService,
  resolveServiceEnv,
  slugify,
  uppercaseEnvKey,
} from "./runtime";
import type { LifecycleConfig } from "@lifecycle/contracts";

describe("environment runtime", () => {
  test("slugify normalizes names to kebab-case", () => {
    expect(slugify("My App")).toBe("my-app");
    expect(slugify("Sydney / Debug Build")).toBe("sydney-debug-build");
    expect(slugify("___")).toBe("unnamed");
  });

  test("uppercaseEnvKey converts names to UPPER_SNAKE_CASE", () => {
    expect(uppercaseEnvKey("web")).toBe("WEB");
    expect(uppercaseEnvKey("api-server")).toBe("API_SERVER");
    expect(uppercaseEnvKey("my app")).toBe("MY_APP");
  });

  test("previewUrlForService builds host-based URL", () => {
    expect(previewUrlForService("my-project-abc123", "web", 52300)).toBe(
      "http://web.my-project-abc123.lifecycle.localhost:52300",
    );
  });

  test("injectAssignedPortsIntoManifest adds PORT to process services", () => {
    const config = {
      workspace: { prepare: [] },
      stack: {
        web: { kind: "service", runtime: "process", command: "bun run web" },
        migrate: { kind: "task", command: "bun run migrate", timeout_seconds: 60 },
      },
    } satisfies LifecycleConfig;

    const next = injectAssignedPortsIntoManifest(config, { web: 43123 });
    const webNode = next.stack.web;
    expect(webNode?.kind).toBe("service");
    if (webNode?.kind === "service" && webNode.runtime === "process") {
      expect(webNode.env?.PORT).toBe("43123");
    }
  });

  test("expandRuntimeTemplates expands LIFECYCLE_ variables", () => {
    const env = { LIFECYCLE_PORT: "3000" };
    expect(expandRuntimeTemplates("http://localhost:${LIFECYCLE_PORT}", env)).toBe(
      "http://localhost:3000",
    );
  });

  test("expandRuntimeTemplates preserves non-LIFECYCLE templates", () => {
    expect(expandRuntimeTemplates("${EXTERNAL_KEY}", {})).toBe("${EXTERNAL_KEY}");
  });

  test("expandRuntimeTemplates throws on unknown LIFECYCLE variable", () => {
    expect(() => expandRuntimeTemplates("${LIFECYCLE_MISSING}", {})).toThrow(
      "Unknown runtime variable",
    );
  });

  test("resolveServiceEnv merges and expands", () => {
    const runtimeEnv = { LIFECYCLE_URL: "http://example.com", OTHER: "val" };
    const serviceEnv = { ORIGIN: "${LIFECYCLE_URL}", CUSTOM: "fixed" };

    const resolved = resolveServiceEnv(serviceEnv, runtimeEnv);

    expect(resolved.ORIGIN).toBe("http://example.com");
    expect(resolved.CUSTOM).toBe("fixed");
    expect(resolved.OTHER).toBe("val");
    expect(resolved.FORCE_COLOR).toBe("1");
  });

  test("buildStackEnv generates LIFECYCLE_ prefixed env vars", () => {
    const env = buildStackEnv({
      stackId: "env_1",
      hostLabel: "my-project-abc123",
      name: "My Project",
      previewProxyPort: 52300,
      rootPath: "/tmp/root",
      services: [{ assigned_port: 43123, name: "web" }],
      sourceRef: "main",
    });

    expect(env.LIFECYCLE_WORKSPACE_ID).toBe("env_1");
    expect(env.LIFECYCLE_WORKSPACE_NAME).toBe("My Project");
    expect(env.LIFECYCLE_WORKSPACE_PATH).toBe("/tmp/root");
    expect(env.LIFECYCLE_SERVICE_WEB_HOST).toBe("127.0.0.1");
    expect(env.LIFECYCLE_SERVICE_WEB_PORT).toBe("43123");
    expect(env.LIFECYCLE_SERVICE_WEB_URL).toBe(
      "http://web.my-project-abc123.lifecycle.localhost:52300",
    );
  });
});
