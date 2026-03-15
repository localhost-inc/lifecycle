import { describe, expect, test } from "bun:test";
import type { ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EnvironmentPanel } from "./environment-panel";
import type { EnvironmentTaskState, SetupStepState } from "../hooks";

const baseWorkspace: WorkspaceRecord = {
  id: "workspace_1",
  project_id: "project_1",
  name: "Environment Panel",
  kind: "managed",
  source_ref: "lifecycle/environment-panel",
  git_sha: "abcdef1234567890",
  worktree_path: "/tmp/workspace_1",
  mode: "local",
  status: "active",
  failure_reason: null,
  failed_at: null,
  created_by: null,
  source_workspace_id: null,
  created_at: "2026-03-09T10:00:00.000Z",
  updated_at: "2026-03-09T10:00:00.000Z",
  last_active_at: "2026-03-09T10:00:00.000Z",
  expires_at: null,
};

const services: ServiceRecord[] = [
  {
    id: "svc_1",
    workspace_id: "workspace_1",
    service_name: "web",
    exposure: "local",
    port_override: null,
    status: "ready",
    status_reason: null,
    default_port: 3000,
    effective_port: 3000,
    preview_status: "ready",
    preview_failure_reason: null,
    preview_url: "http://localhost:3000",
    created_at: "2026-03-09T10:00:00.000Z",
    updated_at: "2026-03-09T10:00:00.000Z",
  },
  {
    id: "svc_2",
    workspace_id: "workspace_1",
    service_name: "api",
    exposure: "local",
    port_override: null,
    status: "starting",
    status_reason: null,
    default_port: 8787,
    effective_port: 8787,
    preview_status: "provisioning",
    preview_failure_reason: null,
    preview_url: "http://localhost:8787",
    created_at: "2026-03-09T10:00:00.000Z",
    updated_at: "2026-03-09T10:00:00.000Z",
  },
];

const readyWebService = services[0]!;
const setupSteps: SetupStepState[] = [
  {
    name: "install",
    output: ["bun install"],
    status: "completed",
  },
];

const environmentTasks: EnvironmentTaskState[] = [
  {
    name: "migrate",
    output: ["bun run db:migrate"],
    status: "running",
  },
];

describe("EnvironmentPanel", () => {
  test("renders environment controls and tabs for an active workspace", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        config: null,
        hasManifest: true,
        isManifestStale: false,
        manifestState: "valid",
        onRestart: async () => {},
        onRun: async () => {},
        onStop: async () => {},
        onUpdateService: async () => {},
        environmentTasks: [],
        setupSteps: [],
        services,
        workspace: baseWorkspace,
      }),
    );

    expect(markup).toContain("Environment");
    expect(markup).toContain(">Stop<");
    expect(markup).not.toContain(">Start<");
    expect(markup).toContain('aria-label="Show environment actions"');
    expect(markup).toContain("Overview");
    expect(markup).toContain("Topology");
    expect(markup).toContain("Logs");
    expect(markup).toContain("Boot sequence");
  });

  test("renders start affordance and failure details for an idle workspace with a failure", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        config: null,
        hasManifest: true,
        isManifestStale: false,
        manifestState: "valid",
        onRestart: async () => {},
        onRun: async () => {},
        onStop: async () => {},
        onUpdateService: async () => {},
        environmentTasks: [],
        setupSteps: setupSteps,
        services,
        workspace: {
          ...baseWorkspace,
          failure_reason: "service_start_failed",
          status: "idle",
        },
      }),
    );

    expect(markup).toContain(">Start<");
    expect(markup).not.toContain(">Stop<");
    expect(markup).not.toContain('aria-label="Show environment actions"');
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain("A service failed to start.");
    expect(markup).toContain("Boot sequence");
    expect(markup).not.toContain("View details");
  });

  test("keeps the start action disabled when no lifecycle.json is present", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        config: null,
        hasManifest: false,
        isManifestStale: false,
        manifestState: "missing",
        onRestart: async () => {},
        onRun: async () => {},
        onStop: async () => {},
        onUpdateService: async () => {},
        environmentTasks: [],
        setupSteps: [],
        services: [],
        workspace: {
          ...baseWorkspace,
          status: "idle",
        },
      }),
    );

    expect(markup).toContain(">Start<");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain("Overview");
    expect(markup).toContain("Logs");
    expect(markup).toContain("Boot sequence");
  });

  test("shows restart guidance when a running workspace manifest is stale", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        config: null,
        hasManifest: true,
        isManifestStale: true,
        manifestState: "valid",
        onRestart: async () => {},
        onRun: async () => {},
        onStop: async () => {},
        onUpdateService: async () => {},
        environmentTasks: [],
        setupSteps: [],
        services,
        workspace: baseWorkspace,
      }),
    );

    expect(markup).toContain(
      "Manifest changed. Stop and start again to apply environment updates.",
    );
  });

  test("renders collapsed service summaries with preview metadata", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        config: null,
        hasManifest: true,
        isManifestStale: false,
        manifestState: "valid",
        onRestart: async () => {},
        onRun: async () => {},
        onStop: async () => {},
        onUpdateService: async () => {},
        environmentTasks: [],
        setupSteps: [],
        services,
        workspace: baseWorkspace,
      }),
    );

    expect(markup).toContain("web");
    expect(markup).toContain("api");
    expect(markup).toContain(":3000");
    expect(markup).toContain(":8787");
    expect(markup).toContain("lucide-external-link");
    expect(markup).toContain("lucide-loader-circle");
    expect(markup).not.toContain("Exposure");
    expect(markup).not.toContain("Copy");
  });

  test("renders sleeping preview state for local services while the workspace sleeps", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        config: null,
        hasManifest: true,
        isManifestStale: false,
        manifestState: "valid",
        onRestart: async () => {},
        onRun: async () => {},
        onStop: async () => {},
        onUpdateService: async () => {},
        environmentTasks: [],
        setupSteps: [],
        services: [
          {
            ...readyWebService,
            preview_status: "sleeping",
            status: "stopped",
            updated_at: "2026-03-09T10:05:00.000Z",
          },
        ],
        workspace: {
          ...baseWorkspace,
          status: "idle",
        },
      }),
    );

    expect(markup).toContain("web");
    expect(markup).toContain(":3000");
    expect(markup).toContain("bg-slate-500/30");
    expect(markup).not.toContain("lucide-external-link");
  });

  test("shows starting status in the header action and overview sections", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        config: {
          workspace: { setup: [], teardown: [] },
          environment: {
            api: {
              kind: "service",
              runtime: "process",
              command: "bun run api",
            },
            postgres: {
              kind: "service",
              runtime: "image",
              image: "postgres:16",
            },
            migrate: {
              kind: "task",
              command: "bun run db:migrate",
              timeout_seconds: 60,
            },
          },
        },
        hasManifest: true,
        isManifestStale: false,
        manifestState: "valid",
        onRestart: async () => {},
        onRun: async () => {},
        onStop: async () => {},
        onUpdateService: async () => {},
        environmentTasks,
        setupSteps: [
          {
            name: "install",
            output: ["bun install"],
            status: "completed",
          },
          {
            name: "migrate",
            output: ["bun run db:migrate"],
            status: "running",
          },
        ],
        services: [
          services[1]!,
          {
            id: "svc-postgres",
            workspace_id: "workspace_1",
            service_name: "postgres",
            exposure: "internal",
            port_override: null,
            status: "ready",
            status_reason: null,
            default_port: 5432,
            effective_port: 5432,
            preview_status: "disabled",
            preview_failure_reason: null,
            preview_url: null,
            created_at: "2026-03-09T10:00:00.000Z",
            updated_at: "2026-03-09T10:00:01.000Z",
          },
        ],
        workspace: {
          ...baseWorkspace,
          status: "starting",
        },
      }),
    );

    expect(markup).toContain("Starting...");
    expect(markup).toContain("Boot sequence");
    expect(markup).toContain("Booting environment");
    expect(markup).toContain("postgres");
    expect(markup).toContain("api");
    expect(markup).toContain("lucide-loader-circle");
    expect(markup).not.toContain("View details");
  });

  test("renders an environment task failure banner separately from setup", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        config: null,
        hasManifest: true,
        isManifestStale: false,
        manifestState: "valid",
        onRestart: async () => {},
        onRun: async () => {},
        onStop: async () => {},
        onUpdateService: async () => {},
        environmentTasks: [
          {
            name: "migrate",
            output: ["Exit code: 1"],
            status: "failed",
          },
        ],
        setupSteps: [],
        services: [],
        workspace: {
          ...baseWorkspace,
          failure_reason: "environment_task_failed",
          status: "idle",
        },
      }),
    );

    expect(markup).toContain("An environment task failed.");
    expect(markup).toContain("Boot sequence");
    expect(markup).toContain("Boot failed");
    expect(markup).toContain("migrate");
  });
});
