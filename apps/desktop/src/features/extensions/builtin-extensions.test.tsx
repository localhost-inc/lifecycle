import { describe, expect, test } from "bun:test";
import type { GitStatusResult, ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import {
  getBuiltinExtensionSlots,
  getEnvironmentExtensionBadge,
  getGitExtensionBadge,
} from "./builtin-extensions";

const baseWorkspace: WorkspaceRecord = {
  id: "workspace_1",
  project_id: "project_1",
  name: "Workspace",
  kind: "managed",
  source_ref: "lifecycle/workspace",
  git_sha: "abcdef12",
  worktree_path: "/tmp/workspace",
  mode: "local",
  status: "idle",
  manifest_fingerprint: null,
  failure_reason: null,
  failed_at: null,
  created_by: null,
  source_workspace_id: null,
  created_at: "2026-03-14T10:00:00.000Z",
  updated_at: "2026-03-14T10:00:00.000Z",
  last_active_at: "2026-03-14T10:00:00.000Z",
  expires_at: null,
};

const readyService: ServiceRecord = {
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
  created_at: "2026-03-14T10:00:00.000Z",
  updated_at: "2026-03-14T10:00:00.000Z",
};

describe("builtin extension badges", () => {
  test("shows a git dot only when changes exist", () => {
    const gitStatus: GitStatusResult = {
      ahead: 0,
      behind: 0,
      branch: "main",
      files: [
        {
          indexStatus: null,
          path: "src/app.tsx",
          staged: false,
          stats: { deletions: 1, insertions: 4 },
          unstaged: true,
          worktreeStatus: "modified",
        },
      ],
      headSha: "abcdef12",
      upstream: "origin/main",
    };

    expect(getGitExtensionBadge(undefined)).toBeNull();
    expect(getGitExtensionBadge({ ...gitStatus, files: [] })).toBeNull();
    expect(getGitExtensionBadge(gitStatus)).toEqual({ kind: "dot", tone: "warning" });
  });

  test("derives environment badge tone from workspace and service state", () => {
    expect(
      getEnvironmentExtensionBadge({
        services: [readyService],
        workspace: { ...baseWorkspace, status: "active" },
      }),
    ).toEqual({ kind: "dot", tone: "success" });

    expect(
      getEnvironmentExtensionBadge({
        services: [{ ...readyService, status: "starting", preview_status: "provisioning" }],
        workspace: { ...baseWorkspace, status: "starting" },
      }),
    ).toEqual({ kind: "dot", tone: "warning" });

    expect(
      getEnvironmentExtensionBadge({
        services: [{ ...readyService, status: "failed", preview_status: "failed" }],
        workspace: { ...baseWorkspace, failure_reason: "service_start_failed" },
      }),
    ).toEqual({ kind: "dot", tone: "danger" });

    expect(
      getEnvironmentExtensionBadge({
        services: [],
        workspace: baseWorkspace,
      }),
    ).toEqual({ kind: "dot", tone: "neutral" });
  });
});

describe("builtin extension slots", () => {
  test("declares git-owned canvas document kinds only for tab-backed history surfaces", () => {
    const slots = getBuiltinExtensionSlots({
      config: null,
      environmentTasks: [],
      gitStatus: undefined,
      hasManifest: false,
      isManifestStale: false,
      launchActions: {
        openChangesDiff: () => {},
        openCommitDiff: () => {},
        openFileViewer: () => {},
        openPullRequest: () => {},
      },
      manifestState: "missing",
      onFocusTerminal: () => {},
      onRun: async () => {},
      onSwitchToExtension: () => {},
      onUpdateService: async () => {},
      services: [],
      setupSteps: [],
      workspace: baseWorkspace,
    });

    const changesSlot = slots.find((slot) => slot.id === "git-changes");
    const historySlot = slots.find((slot) => slot.id === "git-history");
    const environmentSlot = slots.find((slot) => slot.id === "environment");

    expect(changesSlot?.ownedDocumentKinds).toBeUndefined();
    expect(historySlot?.ownedDocumentKinds).toEqual(["commit-diff"]);
    expect(environmentSlot?.ownedDocumentKinds).toBeUndefined();
  });
});
