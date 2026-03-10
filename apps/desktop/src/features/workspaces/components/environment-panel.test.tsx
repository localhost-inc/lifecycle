import { describe, expect, test } from "bun:test";
import type { ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EnvironmentPanel } from "./environment-panel";
import type { SetupStepState } from "../hooks";

const baseWorkspace: WorkspaceRecord = {
  id: "workspace_1",
  project_id: "project_1",
  name: "Environment Panel",
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

describe("EnvironmentPanel", () => {
  test("renders environment controls and tabs for an active workspace", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        hasManifest: true,
        isManifestStale: false,
        manifestState: "valid",
        onRun: async () => {},
        onStop: async () => {},
        onUpdateService: async () => {},
        setupSteps: [],
        services,
        workspace: baseWorkspace,
      }),
    );

    expect(markup).toContain("Environment");
    expect(markup).toContain("Stop");
    expect(markup).not.toContain("Run");
    expect(markup).toContain("Services");
    expect(markup).toContain("Logs");
  });

  test("renders rerun affordance and failure details for an idle workspace with a failure", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        hasManifest: true,
        isManifestStale: false,
        manifestState: "valid",
        onRun: async () => {},
        onStop: async () => {},
        onUpdateService: async () => {},
        setupSteps: setupSteps,
        services,
        workspace: {
          ...baseWorkspace,
          failure_reason: "service_start_failed",
          status: "idle",
        },
      }),
    );

    expect(markup).toContain("Run");
    expect(markup).not.toContain("Stop");
    expect(markup).toContain("service_start_failed");
    expect(markup).toContain("install");
  });

  test("keeps the run action disabled when no lifecycle.json is present", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        hasManifest: false,
        isManifestStale: false,
        manifestState: "missing",
        onRun: async () => {},
        onStop: async () => {},
        onUpdateService: async () => {},
        setupSteps: [],
        services: [],
        workspace: {
          ...baseWorkspace,
          status: "idle",
        },
      }),
    );

    expect(markup).toContain("Run");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain("Services");
    expect(markup).toContain("Logs");
    expect(markup).toContain("Add a lifecycle.json file to the project root");
  });

  test("shows restart guidance when a running workspace manifest is stale", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        hasManifest: true,
        isManifestStale: true,
        manifestState: "valid",
        onRun: async () => {},
        onStop: async () => {},
        onUpdateService: async () => {},
        setupSteps: [],
        services,
        workspace: baseWorkspace,
      }),
    );

    expect(markup).toContain("Manifest changed. Stop and run again to apply service updates.");
  });

  test("renders collapsed service summaries with preview metadata", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        hasManifest: true,
        isManifestStale: false,
        manifestState: "valid",
        onRun: async () => {},
        onStop: async () => {},
        onUpdateService: async () => {},
        setupSteps: [],
        services,
        workspace: baseWorkspace,
      }),
    );

    expect(markup).toContain("web");
    expect(markup).toContain("api");
    expect(markup).toContain("Preview ready");
    expect(markup).toContain("Preview provisioning");
    expect(markup).toContain(":3000");
    expect(markup).toContain(":8787");
    expect(markup).toContain('data-slot="spinner"');
    expect(markup).not.toContain("Exposure");
    expect(markup).not.toContain("Copy");
  });

  test("renders sleeping preview state for local services while the workspace sleeps", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        hasManifest: true,
        isManifestStale: false,
        manifestState: "valid",
        onRun: async () => {},
        onStop: async () => {},
        onUpdateService: async () => {},
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

    expect(markup).toContain("Preview sleeping");
    expect(markup).toContain(":3000");
    expect(markup).toContain("stopped");
  });
});
