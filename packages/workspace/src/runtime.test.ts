import { describe, expect, test } from "bun:test";
import type { LifecycleConfig, ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { previewUrlForService, workspaceHostLabel } from "./runtime";
import {
  buildWorkspaceRuntimeEnv,
  expandRuntimeTemplates,
  injectAssignedPortsIntoManifest,
  resolveServiceEnv,
} from "./environment/runtime";

function workspace(overrides: Partial<WorkspaceRecord> = {}): WorkspaceRecord {
  return {
    id: "ws_12345678",
    project_id: "project_1",
    name: "Workspace 1",
    checkout_type: "worktree",
    source_ref: "lifecycle/workspace-1-ws123456",
    git_sha: null,
    worktree_path: "/tmp/project_1/.worktrees/ws_12345678",
    host: "local",
    manifest_fingerprint: null,
    created_at: "2026-03-12T00:00:00.000Z",
    updated_at: "2026-03-12T00:00:00.000Z",
    last_active_at: "2026-03-12T00:00:00.000Z",
    prepared_at: null,
    status: "active",
    failure_reason: null,
    failed_at: null,
    ...overrides,
  };
}

function service(overrides: Partial<ServiceRecord> = {}): ServiceRecord {
  return {
    id: "svc_web",
    workspace_id: "ws_12345678",
    name: "web",
    status: "stopped",
    status_reason: null,
    assigned_port: 43123,
    preview_url: null,
    created_at: "2026-03-12T00:00:00.000Z",
    updated_at: "2026-03-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("workspace runtime helpers", () => {
  test("derives stable preview labels and URLs from workspace identity", () => {
    const target = workspace();

    expect(workspaceHostLabel(target)).toBe("workspace-1-ws123456");
    expect(previewUrlForService(target, "web", 52300)).toBe(
      "http://web.workspace-1-ws123456.lifecycle.localhost:52300",
    );
  });

  test("injects assigned ports into process services without changing other nodes", () => {
    const config = {
      workspace: { prepare: [] },
      environment: {
        web: {
          kind: "service",
          runtime: "process",
          command: "bun run web",
        },
        migrate: {
          kind: "task",
          command: "bun run migrate",
          timeout_seconds: 60,
        },
      },
    } satisfies LifecycleConfig;

    const next = injectAssignedPortsIntoManifest(config, { web: 43123 });
    const webNode = next.environment.web;
    expect(webNode?.kind).toBe("service");
    if (!webNode || webNode.kind !== "service" || webNode.runtime !== "process") {
      throw new Error("web service was not preserved as a process service");
    }
    expect(webNode.env?.PORT).toBe("43123");

    const migrateNode = next.environment.migrate;
    expect(migrateNode?.kind).toBe("task");
  });

  test("expandRuntimeTemplates expands LIFECYCLE_ variables", () => {
    const env = { LIFECYCLE_SERVICE_API_URL: "http://api.example.com:3000" };
    expect(expandRuntimeTemplates("${LIFECYCLE_SERVICE_API_URL}/health", env)).toBe(
      "http://api.example.com:3000/health",
    );
  });

  test("expandRuntimeTemplates preserves non-LIFECYCLE templates", () => {
    expect(expandRuntimeTemplates("${EXTERNAL_API_KEY}", {})).toBe("${EXTERNAL_API_KEY}");
  });

  test("expandRuntimeTemplates throws on unknown LIFECYCLE variable", () => {
    expect(() => expandRuntimeTemplates("${LIFECYCLE_MISSING}", {})).toThrow(
      "Unknown runtime variable",
    );
  });

  test("resolveServiceEnv merges service env with runtime env and color vars", () => {
    const runtimeEnv = {
      LIFECYCLE_SERVICE_API_URL: "http://api.example.com:3000",
      LIFECYCLE_WORKSPACE_ID: "ws_1",
    };
    const serviceEnv = {
      VITE_API_ORIGIN: "${LIFECYCLE_SERVICE_API_URL}",
      CUSTOM_KEY: "untouched",
    };

    const resolved = resolveServiceEnv(serviceEnv, runtimeEnv);

    expect(resolved.VITE_API_ORIGIN).toBe("http://api.example.com:3000");
    expect(resolved.CUSTOM_KEY).toBe("untouched");
    expect(resolved.LIFECYCLE_WORKSPACE_ID).toBe("ws_1");
    expect(resolved.FORCE_COLOR).toBe("1");
    expect(resolved.CLICOLOR_FORCE).toBe("1");
  });

  test("builds runtime env with preview URLs and direct bind addresses", () => {
    const env = buildWorkspaceRuntimeEnv({
      previewProxyPort: 52300,
      services: [service()],
      workspace: workspace(),
      worktreePath: "/tmp/project_1/.worktrees/ws_12345678",
    });

    expect(env.LIFECYCLE_WORKSPACE_ID).toBe("ws_12345678");
    expect(env.LIFECYCLE_SERVICE_WEB_HOST).toBe("127.0.0.1");
    expect(env.LIFECYCLE_SERVICE_WEB_PORT).toBe("43123");
    expect(env.LIFECYCLE_SERVICE_WEB_ADDRESS).toBe("127.0.0.1:43123");
    expect(env.LIFECYCLE_SERVICE_WEB_URL).toBe(
      "http://web.workspace-1-ws123456.lifecycle.localhost:52300",
    );
  });
});
