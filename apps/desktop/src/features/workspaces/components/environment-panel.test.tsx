import { describe, expect, test } from "bun:test";
import type { ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EnvironmentPanel } from "./environment-panel";

const baseWorkspace: WorkspaceRecord = {
  id: "workspace_1",
  project_id: "project_1",
  name: "Environment Panel",
  source_ref: "lifecycle/environment-panel",
  git_sha: "abcdef1234567890",
  worktree_path: "/tmp/workspace_1",
  mode: "local",
  status: "ready",
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
    preview_state: "ready",
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
    preview_state: "provisioning",
    preview_failure_reason: null,
    preview_url: "http://localhost:8787",
    created_at: "2026-03-09T10:00:00.000Z",
    updated_at: "2026-03-09T10:00:00.000Z",
  },
];

const readyWebService = services[0]!;

describe("EnvironmentPanel", () => {
  test("renders environment controls and tabs for a ready workspace", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        hasManifest: true,
        isManifestStale: false,
        manifestState: "valid",
        onRun: async () => {},
        onStop: async () => {},
        onUpdateService: async () => {},
        services,
        workspace: baseWorkspace,
      }),
    );

    expect(markup).toContain("Environment");
    expect(markup).toContain("Ready");
    expect(markup).toContain("Stop");
    expect(markup).not.toContain("Run");
    expect(markup).toContain("Services");
    expect(markup).toContain("Logs");
    expect(markup).toContain("1/2 ready");
  });

  test("renders rerun affordance and failure details for a failed workspace", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        hasManifest: true,
        isManifestStale: false,
        manifestState: "valid",
        onRun: async () => {},
        onStop: async () => {},
        onUpdateService: async () => {},
        services,
        workspace: {
          ...baseWorkspace,
          failure_reason: "service_start_failed",
          status: "failed",
        },
      }),
    );

    expect(markup).toContain("Failed");
    expect(markup).toContain("Run");
    expect(markup).not.toContain("Stop");
    expect(markup).toContain("service_start_failed");
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
        services: [],
        workspace: {
          ...baseWorkspace,
          status: "sleeping",
        },
      }),
    );

    expect(markup).toContain("Run");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain("Services");
    expect(markup).toContain("Logs");
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
        services,
        workspace: baseWorkspace,
      }),
    );

    expect(markup).toContain("Manifest changed. Stop and run again to apply service updates.");
  });

  test("renders service controls and preview metadata", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        hasManifest: true,
        isManifestStale: false,
        manifestState: "valid",
        onRun: async () => {},
        onStop: async () => {},
        onUpdateService: async () => {},
        services,
        workspace: baseWorkspace,
      }),
    );

    expect(markup).toContain("Exposure");
    expect(markup).toContain("Port");
    expect(markup).toContain("Preview ready");
    expect(markup).toContain("Preview provisioning");
    expect(markup).toContain("Open");
    expect(markup).toContain("Copy URL");
    expect(markup).toContain("http://localhost:3000");
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
        services: [
          {
            ...readyWebService,
            preview_state: "sleeping",
            status: "stopped",
            updated_at: "2026-03-09T10:05:00.000Z",
          },
        ],
        workspace: {
          ...baseWorkspace,
          status: "sleeping",
        },
      }),
    );

    expect(markup).toContain("Preview sleeping");
    expect(markup).toContain("http://localhost:3000");
  });
});
