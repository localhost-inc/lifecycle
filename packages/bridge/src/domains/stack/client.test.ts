import { describe, expect, test } from "bun:test";
import { createStartStackInput } from "./client";
import type { ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";

describe("createStartStackInput", () => {
  test("derives stack start input from a workspace record and services", () => {
    const workspace: WorkspaceRecord = {
      id: "workspace_1",
      repository_id: "project_1",
      name: "frost-beacon",
      slug: "frost-beacon",
      checkout_type: "worktree",
      source_ref: "lifecycle/frost-beacon",
      git_sha: "abc123",
      workspace_root: "/tmp/frost-beacon",
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
      createStartStackInput({
        hostLabel: "frost-beacon",
        repositorySlug: "hello-world",
        serviceNames: ["api"],
        services,
        workspace,
      }),
    ).toEqual({
      stackId: workspace.id,
      hostLabel: "frost-beacon",
      logScope: {
        repositorySlug: "hello-world",
        workspaceSlug: "frost-beacon",
      },
      name: workspace.name,
      prepared: true,
      readyServiceNames: ["web"],
      rootPath: "/tmp/frost-beacon",
      serviceNames: ["api"],
      services,
      sourceRef: workspace.source_ref,
    });
  });

  test("fails loudly when the workspace has no workspace root", () => {
    const workspace = {
      id: "workspace_1",
      workspace_root: null,
    } as WorkspaceRecord;

    expect(() =>
      createStartStackInput({
        hostLabel: "frost-beacon",
        repositorySlug: "hello-world",
        services: [],
        workspace,
      }),
    ).toThrow('Workspace "workspace_1" has no workspace root.');
  });

  test("treats root workspaces as prepared even when prepared_at is null", () => {
    const workspace: WorkspaceRecord = {
      id: "workspace_root",
      repository_id: "project_1",
      name: "main",
      slug: "main",
      checkout_type: "root",
      source_ref: "main",
      git_sha: "abc123",
      workspace_root: "/tmp/lifecycle",
      host: "local",
      manifest_fingerprint: null,
      created_at: "2026-03-10T10:00:00.000Z",
      updated_at: "2026-03-10T10:00:00.000Z",
      last_active_at: "2026-03-10T10:00:00.000Z",
      prepared_at: null,
      status: "active",
      failure_reason: null,
      failed_at: null,
    };

    expect(
      createStartStackInput({
        hostLabel: "main",
        repositorySlug: "lifecycle",
        services: [],
        workspace,
      }).prepared,
    ).toBe(true);
  });
});
