import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { LifecycleConfig, ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as reactQuery from "@tanstack/react-query";
import type { ServiceLogSnapshot } from "@lifecycle/stack";
import { workspaceKeys } from "@/features/workspaces/state/workspace-query-keys";

const baseWorkspace: WorkspaceRecord = {
  id: "workspace_1",
  repository_id: "project_1",
  name: "Environment Panel",
  checkout_type: "worktree",
  source_ref: "lifecycle/environment-panel",
  git_sha: "abcdef1234567890",
  worktree_path: "/tmp/workspace_1",
  host: "local",
  created_at: "2026-03-09T10:00:00.000Z",
  updated_at: "2026-03-09T10:00:00.000Z",
  last_active_at: "2026-03-09T10:00:00.000Z",
  status: "active",
  failure_reason: null,
  failed_at: null,
};

const services: ServiceRecord[] = [
  {
    id: "svc_1",
    workspace_id: "workspace_1",
    name: "web",
    status: "ready",
    status_reason: null,
    assigned_port: 3000,
    preview_url: "http://127.0.0.1:3000",
    created_at: "2026-03-09T10:00:00.000Z",
    updated_at: "2026-03-09T10:00:00.000Z",
  },
  {
    id: "svc_2",
    workspace_id: "workspace_1",
    name: "api",
    status: "starting",
    status_reason: null,
    assigned_port: 8787,
    preview_url: "http://127.0.0.1:8787",
    created_at: "2026-03-09T10:00:00.000Z",
    updated_at: "2026-03-09T10:00:00.000Z",
  },
];

interface RenderEnvironmentPanelOptions {
  config?: LifecycleConfig | null;
  hasManifest?: boolean;
  manifestState?: "invalid" | "missing" | "valid";
  serviceLogs?: ServiceLogSnapshot[] | undefined;
  services?: ServiceRecord[];
  workspace?: WorkspaceRecord;
}

async function renderEnvironmentPanel(options: RenderEnvironmentPanelOptions = {}) {
  const serviceLogsSpy = spyOn(reactQuery, "useQuery").mockReturnValue({
    data: options.serviceLogs,
  } as never);
  const { EnvironmentPanel } = await import("./environment-panel");

  return {
    markup: renderToStaticMarkup(
      createElement(EnvironmentPanel, {
        config: options.config ?? null,
        hasManifest: options.hasManifest ?? true,
        manifestState: options.manifestState ?? "valid",
        onOpenPreview: () => {},
        onRun: async () => {},
        services: options.services ?? services,
        workspace: options.workspace ?? baseWorkspace,
      }),
    ),
    serviceLogsSpy,
  };
}

describe("EnvironmentPanel", () => {
  afterEach(() => {
    mock.restore();
  });

  test("reads service logs for the rendered workspace", async () => {
    const { markup, serviceLogsSpy } = await renderEnvironmentPanel({
      serviceLogs: [],
    });

    expect(markup).toContain("web");
    expect(markup).toContain("api");
    expect(serviceLogsSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        queryKey: workspaceKeys.serviceLogs("workspace_1"),
      }),
    );
  });

  test("renders service log-only rows when runtime logs exist before service records", async () => {
    const { markup } = await renderEnvironmentPanel({
      serviceLogs: [{ lines: [{ stream: "stdout", text: "ready" }], name: "worker" }],
      services: [],
      workspace: {
        ...baseWorkspace,
        failure_reason: "service_start_failed",
        status: "active",
      },
    });

    expect(markup).toContain("worker");
    expect(markup).toContain("ready");
  });

  test("shows idle guidance when no lifecycle.json is present", async () => {
    const { markup } = await renderEnvironmentPanel({
      hasManifest: false,
      manifestState: "missing",
      serviceLogs: [],
      services: [],
      workspace: {
        ...baseWorkspace,
        status: "active",
      },
    });

    expect(markup).toContain("Add a");
    expect(markup).toContain("lifecycle.json");
  });

  test("shows invalid manifest guidance when lifecycle.json cannot be parsed", async () => {
    const { markup } = await renderEnvironmentPanel({
      hasManifest: false,
      manifestState: "invalid",
      serviceLogs: [],
      services: [],
      workspace: {
        ...baseWorkspace,
        status: "active",
      },
    });

    expect(markup).toContain("lifecycle.json is invalid");
    expect(markup).toContain("Fix it before starting this workspace.");
  });

  test("renders service names from the current config", async () => {
    const { markup } = await renderEnvironmentPanel({
      config: {
        workspace: { prepare: [], teardown: [] },
        environment: {
          web: { kind: "service", runtime: "process", command: "bun run dev" },
          api: { kind: "service", runtime: "process", command: "bun run api" },
        },
      },
      serviceLogs: [],
    });

    expect(markup).toContain("web");
    expect(markup).toContain("api");
  });
});
