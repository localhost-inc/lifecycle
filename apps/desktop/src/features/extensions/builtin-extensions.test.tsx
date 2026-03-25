import { describe, expect, test } from "bun:test";
import type { GitStatusResult, ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import {
  getBuiltinExtensionSlots,
  getEnvironmentExtensionBadge,
  getGitExtensionBadge,
} from "@/features/extensions/builtin-extensions";

const baseWorkspace: WorkspaceRecord = {
  id: "workspace_1",
  project_id: "project_1",
  name: "Workspace",
  checkout_type: "worktree",
  source_ref: "lifecycle/workspace",
  git_sha: "abcdef12",
  worktree_path: "/tmp/workspace",
  target: "local",
  manifest_fingerprint: null,
  created_at: "2026-03-14T10:00:00.000Z",
  updated_at: "2026-03-14T10:00:00.000Z",
  last_active_at: "2026-03-14T10:00:00.000Z",
  status: "active",
  failure_reason: null,
  failed_at: null,
};

const readyService: ServiceRecord = {
  id: "svc_1",
  workspace_id: "workspace_1",
  name: "web",
  status: "ready",
  status_reason: null,
  assigned_port: 3000,
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
        workspace: { ...baseWorkspace, status: "active" },
        services: [readyService],
      }),
    ).toEqual({ kind: "dot", tone: "success" });

    expect(
      getEnvironmentExtensionBadge({
        workspace: { ...baseWorkspace, status: "provisioning" },
        services: [{ ...readyService, status: "starting" }],
      }),
    ).toEqual({ kind: "dot", tone: "warning" });

    expect(
      getEnvironmentExtensionBadge({
        workspace: { ...baseWorkspace, failure_reason: "service_start_failed" },
        services: [{ ...readyService, status: "failed" }],
      }),
    ).toEqual({ kind: "dot", tone: "danger" });

    expect(
      getEnvironmentExtensionBadge({
        workspace: baseWorkspace,
        services: [],
      }),
    ).toEqual({ kind: "dot", tone: "neutral" });
  });
});

describe("builtin extension slots", () => {
  test("registers the built-in extension order and owned canvas document kinds", () => {
    const slots = getBuiltinExtensionSlots({
      config: null,
      gitStatus: undefined,
      hasManifest: false,
      launchActions: {
        openAgentSession: () => {},
        openChangesDiff: () => {},
        openCommitDiff: () => {},
        openFileViewer: () => {},
        openPreview: () => {},
        openPullRequest: () => {},
      },
      manifestState: "missing",
      onRun: async () => {},
      onSwitchToExtension: () => {},
      services: [],
      workspace: baseWorkspace,
    });

    expect(slots.map((slot) => slot.id)).toEqual([
      "git-changes",
      "explorer",
      "git-history",
      "pull-requests",
      "session-history",
      "environment",
    ]);

    const changesSlot = slots.find((slot) => slot.id === "git-changes");
    const explorerSlot = slots.find((slot) => slot.id === "explorer");
    const historySlot = slots.find((slot) => slot.id === "git-history");
    const environmentSlot = slots.find((slot) => slot.id === "environment");

    expect(changesSlot?.ownedSurfaceKinds).toBeUndefined();
    expect(explorerSlot?.ownedSurfaceKinds).toBeUndefined();
    expect(historySlot?.ownedSurfaceKinds).toEqual(["commit-diff"]);
    expect(environmentSlot?.ownedSurfaceKinds).toBeUndefined();
  });
});
