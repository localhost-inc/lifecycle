import { describe, expect, test } from "bun:test";
import type {
  LifecycleEvent,
  ServiceRecord,
  TerminalRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import {
  createWorkspaceManifestQuery,
  reduceWorkspaceServices,
  reduceWorkspaceActivity,
  reduceWorkspaceRecord,
  reduceWorkspaceSnapshot,
  reduceWorkspacesByProject,
  type WorkspaceActivityItem,
} from "./hooks";

function applyActivityEvent(
  current: WorkspaceActivityItem[] | undefined,
  event: LifecycleEvent,
  workspaceId = "ws_1",
): WorkspaceActivityItem[] | undefined {
  const result = reduceWorkspaceActivity(current, event, workspaceId);
  return result.kind === "replace" ? result.data : current;
}

describe("reduceWorkspaceActivity", () => {
  test("builds launcher activity items from workspace lifecycle events", () => {
    const activity = applyActivityEvent(undefined, {
      id: "event-1",
      kind: "terminal.created",
      occurred_at: "2026-03-10T10:00:00.000Z",
      terminal: {
        created_by: null,
        ended_at: null,
        exit_code: null,
        failure_reason: null,
        harness_provider: "codex",
        harness_session_id: "session-12345678",
        id: "term-1",
        label: "Codex · Session 7",
        last_active_at: "2026-03-10T10:00:00.000Z",
        launch_type: "harness",
        started_at: "2026-03-10T10:00:00.000Z",
        status: "active",
        workspace_id: "ws_1",
      },
      workspace_id: "ws_1",
    });

    expect(activity).toEqual([
      {
        detail: "Codex · Session 7",
        id: "event-1",
        kind: "terminal.created",
        occurredAt: "2026-03-10T10:00:00.000Z",
        title: "Codex session started",
        tone: "success",
      },
    ]);
  });

  test("ignores unrelated workspace events and setup stdout noise", () => {
    const current = applyActivityEvent(undefined, {
      failure_reason: null,
      id: "event-1",
      kind: "workspace.status_changed",
      occurred_at: "2026-03-10T10:00:00.000Z",
      status: "starting",
      workspace_id: "ws_1",
    });
    const afterNoise = applyActivityEvent(current, {
      data: "pulling dependencies",
      event_kind: "stdout",
      id: "event-2",
      kind: "workspace.setup_progress",
      occurred_at: "2026-03-10T10:00:05.000Z",
      step_name: "Install",
      workspace_id: "ws_1",
    });
    const afterOtherWorkspace = applyActivityEvent(afterNoise, {
      id: "event-3",
      kind: "service.status_changed",
      occurred_at: "2026-03-10T10:00:10.000Z",
      service_name: "web",
      status: "ready",
      status_reason: null,
      workspace_id: "ws_2",
    });

    expect(afterOtherWorkspace).toEqual(current);
  });

  test("keeps workspace activity newest-first and bounded", () => {
    let current: WorkspaceActivityItem[] | undefined = undefined;

    for (let index = 0; index < 40; index += 1) {
      current = applyActivityEvent(current, {
        failure_reason: null,
        id: `event-${index}`,
        kind: "workspace.status_changed",
        occurred_at: `2026-03-10T10:${String(index).padStart(2, "0")}:00.000Z`,
        status: index % 2 === 0 ? "starting" : "active",
        workspace_id: "ws_1",
      });
    }

    expect(current).toHaveLength(32);
    expect(current?.[0]?.id).toBe("event-39");
    expect(current?.[31]?.id).toBe("event-8");
  });
});

describe("reduceWorkspacesByProject", () => {
  test("applies git head changes to matching workspace records", () => {
    const rootWorkspace: WorkspaceRecord = {
      created_at: "2026-03-10T10:00:00.000Z",
      created_by: null,
      expires_at: null,
      failed_at: null,
      failure_reason: null,
      git_sha: "aaaaaaaa",
      id: "ws_1",
      kind: "root",
      last_active_at: "2026-03-10T10:00:00.000Z",
      manifest_fingerprint: null,
      mode: "local",
      name: "Root",
      project_id: "project_1",
      source_ref: "main",
      source_workspace_id: null,
      status: "active",
      updated_at: "2026-03-10T10:00:00.000Z",
      worktree_path: "/tmp/project_1",
    };
    const current: Record<string, WorkspaceRecord[]> = {
      project_1: [rootWorkspace],
    };

    const result = reduceWorkspacesByProject(current, {
      ahead: 0,
      behind: 0,
      branch: "feature/root-live",
      head_sha: "bbbbbbbb",
      id: "event-1",
      kind: "git.head_changed",
      occurred_at: "2026-03-10T10:05:00.000Z",
      upstream: "origin/feature/root-live",
      workspace_id: "ws_1",
    });

    expect(result).toEqual({
      kind: "replace",
      data: {
        project_1: [
          {
            ...rootWorkspace,
            source_ref: "feature/root-live",
            git_sha: "bbbbbbbb",
          },
        ],
      },
    });
  });
});

describe("reduceWorkspaceRecord", () => {
  test("applies git head changes to the selected workspace record", () => {
    const current: WorkspaceRecord = {
      created_at: "2026-03-10T10:00:00.000Z",
      created_by: null,
      expires_at: null,
      failed_at: null,
      failure_reason: null,
      git_sha: "aaaaaaaa",
      id: "ws_1",
      kind: "root" as const,
      last_active_at: "2026-03-10T10:00:00.000Z",
      manifest_fingerprint: null,
      mode: "local" as const,
      name: "Root",
      project_id: "project_1",
      source_ref: "main",
      source_workspace_id: null,
      status: "active" as const,
      updated_at: "2026-03-10T10:00:00.000Z",
      worktree_path: "/tmp/project_1",
    };

    const result = reduceWorkspaceRecord(
      current,
      {
        ahead: null,
        behind: null,
        branch: "HEAD",
        head_sha: null,
        id: "event-1",
        kind: "git.head_changed",
        occurred_at: "2026-03-10T10:05:00.000Z",
        upstream: null,
        workspace_id: "ws_1",
      },
      "ws_1",
    );

    expect(result).toEqual({
      kind: "replace",
      data: {
        ...current,
        source_ref: "HEAD",
        git_sha: null,
      },
    });
  });

  test("patches manifest fingerprints from manifest sync facts", () => {
    const current: WorkspaceRecord = {
      created_at: "2026-03-10T10:00:00.000Z",
      created_by: null,
      expires_at: null,
      failed_at: null,
      failure_reason: null,
      git_sha: "aaaaaaaa",
      id: "ws_1",
      kind: "root" as const,
      last_active_at: "2026-03-10T10:00:00.000Z",
      manifest_fingerprint: "manifest-old",
      mode: "local" as const,
      name: "Root",
      project_id: "project_1",
      source_ref: "main",
      source_workspace_id: null,
      status: "active" as const,
      updated_at: "2026-03-10T10:00:00.000Z",
      worktree_path: "/tmp/project_1",
    };

    const result = reduceWorkspaceRecord(
      current,
      {
        id: "event-2",
        kind: "workspace.manifest_synced",
        manifest_fingerprint: "manifest-new",
        occurred_at: "2026-03-10T10:06:00.000Z",
        services: [],
        workspace_id: "ws_1",
      },
      "ws_1",
    );

    expect(result).toEqual({
      kind: "replace",
      data: {
        ...current,
        manifest_fingerprint: "manifest-new",
      },
    });
  });
});

describe("createWorkspaceManifestQuery", () => {
  test("reads lifecycle.json from the selected workspace worktree path", async () => {
    const descriptor = createWorkspaceManifestQuery("ws_1", "/tmp/frost-grove");
    const manifestReads: string[] = [];

    const result = await descriptor.fetch({
      readManifest: async (dirPath: string) => {
        manifestReads.push(dirPath);
        return { state: "missing" } as const;
      },
    } as never);

    expect(descriptor.key).toEqual(["workspace-manifest", "ws_1"]);
    expect(manifestReads).toEqual(["/tmp/frost-grove"]);
    expect(result).toEqual({ state: "missing" });
  });
});

describe("reduceWorkspaceSnapshot", () => {
  test("patches workspace, service, and terminal facts without refetching", () => {
    const workspace: WorkspaceRecord = {
      created_at: "2026-03-10T10:00:00.000Z",
      created_by: null,
      expires_at: null,
      failed_at: null,
      failure_reason: null,
      git_sha: "aaaaaaaa",
      id: "ws_1",
      kind: "root" as const,
      last_active_at: "2026-03-10T10:00:00.000Z",
      manifest_fingerprint: null,
      mode: "local" as const,
      name: "Root",
      project_id: "project_1",
      source_ref: "main",
      source_workspace_id: null,
      status: "active" as const,
      updated_at: "2026-03-10T10:00:00.000Z",
      worktree_path: "/tmp/project_1",
    };
    const services: ServiceRecord[] = [
      {
        created_at: "2026-03-10T10:00:00.000Z",
        default_port: 3000,
        effective_port: 3000,
        exposure: "local",
        id: "svc_1",
        port_override: null,
        preview_failure_reason: null,
        preview_status: "sleeping",
        preview_url: "http://localhost:3000",
        service_name: "web",
        status: "stopped",
        status_reason: null,
        updated_at: "2026-03-10T10:00:00.000Z",
        workspace_id: "ws_1",
      },
    ];
    const terminals: TerminalRecord[] = [
      {
        created_by: null,
        ended_at: null,
        exit_code: null,
        failure_reason: null,
        harness_provider: null,
        harness_session_id: null,
        id: "term_1",
        label: "Shell",
        last_active_at: "2026-03-10T10:00:00.000Z",
        launch_type: "shell",
        started_at: "2026-03-10T10:00:00.000Z",
        status: "active",
        workspace_id: "ws_1",
      },
    ];

    const current = {
      services,
      terminals,
      workspace,
    };
    const service = services[0]!;
    const terminal = terminals[0]!;

    const serviceResult = reduceWorkspaceSnapshot(
      current,
      {
        id: "event-1",
        kind: "service.status_changed",
        occurred_at: "2026-03-10T10:05:00.000Z",
        service_name: "web",
        status: "ready",
        status_reason: null,
        workspace_id: "ws_1",
      },
      "ws_1",
    );
    expect(serviceResult).toEqual({
      kind: "replace",
      data: {
        services: [
          {
            ...service,
            status: "ready",
            status_reason: null,
          },
        ],
        terminals,
        workspace,
      },
    });

    const terminalResult = reduceWorkspaceSnapshot(
      current,
      {
        id: "event-2",
        kind: "terminal.renamed",
        label: "Shell 2",
        occurred_at: "2026-03-10T10:06:00.000Z",
        terminal_id: "term_1",
        workspace_id: "ws_1",
      },
      "ws_1",
    );
    expect(terminalResult).toEqual({
      kind: "replace",
      data: {
        services,
        terminals: [
          {
            ...terminal,
            label: "Shell 2",
          },
        ],
        workspace,
      },
    });

    const workspaceResult = reduceWorkspaceSnapshot(
      current,
      {
        ahead: null,
        behind: null,
        branch: "feature/root-live",
        head_sha: "bbbbbbbb",
        id: "event-3",
        kind: "git.head_changed",
        occurred_at: "2026-03-10T10:07:00.000Z",
        upstream: null,
        workspace_id: "ws_1",
      },
      "ws_1",
    );
    expect(workspaceResult).toEqual({
      kind: "replace",
      data: {
        services,
        terminals,
        workspace: {
          ...workspace,
          git_sha: "bbbbbbbb",
          source_ref: "feature/root-live",
        },
      },
    });
  });
});

describe("reduceWorkspaceServices", () => {
  test("patches service configuration facts without refetching", () => {
    const current: ServiceRecord[] = [
      {
        created_at: "2026-03-10T10:00:00.000Z",
        default_port: 3000,
        effective_port: 3000,
        exposure: "local",
        id: "svc_1",
        port_override: null,
        preview_failure_reason: null,
        preview_status: "ready",
        preview_url: "http://localhost:3000",
        service_name: "web",
        status: "ready",
        status_reason: null,
        updated_at: "2026-03-10T10:00:00.000Z",
        workspace_id: "ws_1",
      },
    ];
    const currentService = current[0]!;

    const result = reduceWorkspaceServices(
      current,
      {
        id: "event-3",
        kind: "service.configuration_changed",
        occurred_at: "2026-03-10T10:07:00.000Z",
        service: {
          ...currentService,
          effective_port: 4100,
          exposure: "internal",
          port_override: 4100,
          preview_failure_reason: null,
          preview_status: "disabled",
          preview_url: null,
        },
        workspace_id: "ws_1",
      },
      "ws_1",
    );

    expect(result).toEqual({
      kind: "replace",
      data: [
        {
          ...currentService,
          effective_port: 4100,
          exposure: "internal",
          port_override: 4100,
          preview_failure_reason: null,
          preview_status: "disabled",
          preview_url: null,
        },
      ],
    });
  });

  test("replaces services on manifest sync outcomes", () => {
    const nextServices: ServiceRecord[] = [
      {
        created_at: "2026-03-10T10:08:00.000Z",
        default_port: 4100,
        effective_port: 4100,
        exposure: "internal",
        id: "svc_2",
        port_override: null,
        preview_failure_reason: null,
        preview_status: "disabled",
        preview_url: null,
        service_name: "api",
        status: "stopped",
        status_reason: null,
        updated_at: "2026-03-10T10:08:00.000Z",
        workspace_id: "ws_1",
      },
    ];

    expect(
      reduceWorkspaceServices(
        [],
        {
          id: "event-4",
          kind: "workspace.manifest_synced",
          manifest_fingerprint: "manifest-next",
          occurred_at: "2026-03-10T10:08:00.000Z",
          services: nextServices,
          workspace_id: "ws_1",
        },
        "ws_1",
      ),
    ).toEqual({ kind: "replace", data: nextServices });
  });
});
