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
    preview_state: "disabled",
    preview_failure_reason: null,
    preview_url: null,
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
    preview_state: "disabled",
    preview_failure_reason: null,
    preview_url: null,
    created_at: "2026-03-09T10:00:00.000Z",
    updated_at: "2026-03-09T10:00:00.000Z",
  },
];

describe("EnvironmentPanel", () => {
  test("renders environment controls and tabs for a ready workspace", () => {
    const markup = renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        hasManifest: true,
        onRun: async () => {},
        onStop: async () => {},
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
        onRun: async () => {},
        onStop: async () => {},
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
        onRun: async () => {},
        onStop: async () => {},
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
});
