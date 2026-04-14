import { describe, expect, test } from "bun:test";
import {
  DEFAULT_BRIDGE_PORT,
  buildStackEnv,
  expandRuntimeTemplates,
  injectAssignedPortsIntoManifest,
  parsePreviewHost,
  previewHostnameForService,
  previewUrlForService,
  resolveBridgePort,
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

  test("previewHostnameForService builds a stable host name", () => {
    expect(previewHostnameForService("my-project-abc123", "API Server")).toBe(
      "api-server.my-project-abc123.lifecycle.localhost",
    );
  });

  test("parsePreviewHost extracts service and workspace labels", () => {
    expect(parsePreviewHost("web.my-project-abc123.lifecycle.localhost:52300")).toEqual({
      hostLabel: "my-project-abc123",
      serviceLabel: "web",
    });
    expect(parsePreviewHost("127.0.0.1")).toBeNull();
  });

  test("resolveBridgePort uses the configured environment or the default", () => {
    expect(resolveBridgePort({})).toBe(DEFAULT_BRIDGE_PORT);
    expect(resolveBridgePort({ LIFECYCLE_BRIDGE_PORT: "52444" })).toBe(52444);
  });

  test("injectAssignedPortsIntoManifest adds PORT to process services", () => {
    const config = {
      workspace: { prepare: [] },
      stack: {
        nodes: {
          web: { kind: "process", command: "bun run web" },
          migrate: { kind: "task", command: "bun run migrate", timeout_seconds: 60 },
        },
      },
    } satisfies LifecycleConfig;

    const next = injectAssignedPortsIntoManifest(config, { web: 43123 });
    const webNode = next.stack?.nodes.web;
    expect(webNode?.kind).toBe("process");
    if (webNode?.kind === "process") {
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
      bridgePort: 52300,
      stackId: "env_1",
      hostLabel: "my-project-abc123",
      name: "My Project",
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

  test("buildStackEnv falls back to the assigned service port when no preview proxy port exists", () => {
    const env = buildStackEnv({
      bridgePort: 0,
      stackId: "env_1",
      hostLabel: "my-project-abc123",
      name: "My Project",
      rootPath: "/tmp/root",
      services: [{ assigned_port: 43123, name: "web" }],
      sourceRef: "main",
    });

    expect(env.LIFECYCLE_SERVICE_WEB_URL).toBe(
      "http://web.my-project-abc123.lifecycle.localhost:43123",
    );
  });
});
