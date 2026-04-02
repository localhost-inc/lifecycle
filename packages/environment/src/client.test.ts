import { describe, expect, test } from "bun:test";
import { createStartEnvironmentInput } from "./client";
import type { ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";

describe("createStartEnvironmentInput", () => {
  test("derives environment start input from a workspace record and services", () => {
    const workspace: WorkspaceRecord = {
      id: "workspace_1",
      repository_id: "project_1",
      name: "frost-beacon",
      checkout_type: "worktree",
      source_ref: "lifecycle/frost-beacon",
      git_sha: "abc123",
      worktree_path: "/tmp/frost-beacon",
      host: "local",
      manifest_fingerprint: "manifest_1",
      created_at: "2026-03-10T10:00:00.000Z",
      updated_at: "2026-03-10T10:00:00.000Z",
      last_active_at: "2026-03-10T10:00:00.000Z",
      prepared_at: "2026-03-10T10:05:00.000Z",
      status: "active",
      failure_reason: null,
      failed_at: null,
    };
    const services: ServiceRecord[] = [
      {
        id: "service_web",
        workspace_id: workspace.id,
        name: "web",
        status: "ready",
        status_reason: null,
        assigned_port: 3000,
        preview_url: "http://web.frost-beacon.lifecycle.localhost:52300",
        created_at: workspace.created_at,
        updated_at: workspace.updated_at,
      },
      {
        id: "service_api",
        workspace_id: workspace.id,
        name: "api",
        status: "stopped",
        status_reason: null,
        assigned_port: null,
        preview_url: null,
        created_at: workspace.created_at,
        updated_at: workspace.updated_at,
      },
    ];

    expect(
      createStartEnvironmentInput({
        hostLabel: "frost-beacon",
        serviceNames: ["api"],
        services,
        workspace,
      }),
    ).toEqual({
      environmentId: workspace.id,
      hostLabel: "frost-beacon",
      name: workspace.name,
      prepared: true,
      readyServiceNames: ["web"],
      rootPath: "/tmp/frost-beacon",
      serviceNames: ["api"],
      services,
      sourceRef: workspace.source_ref,
    });
  });

  test("fails loudly when the workspace has no worktree path", () => {
    const workspace = {
      id: "workspace_1",
      worktree_path: null,
    } as WorkspaceRecord;

    expect(() =>
      createStartEnvironmentInput({
        hostLabel: "frost-beacon",
        services: [],
        workspace,
      }),
    ).toThrow('Workspace "workspace_1" has no worktree path.');
  });
});
