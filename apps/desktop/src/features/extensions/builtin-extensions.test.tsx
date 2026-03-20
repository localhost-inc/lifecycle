import { describe, expect, test } from "bun:test";
import type {
  EnvironmentRecord,
  GitStatusResult,
  ServiceRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import {
  getBuiltinExtensionSlots,
  getEnvironmentExtensionBadge,
  getGitExtensionBadge,
} from "@/features/extensions/builtin-extensions";

const baseWorkspace: WorkspaceRecord = {
  id: "workspace_1",
  project_id: "project_1",
  name: "Workspace",
  kind: "managed",
  source_ref: "lifecycle/workspace",
  git_sha: "abcdef12",
  worktree_path: "/tmp/workspace",
  mode: "local",
  manifest_fingerprint: null,
  created_by: null,
  source_workspace_id: null,
  created_at: "2026-03-14T10:00:00.000Z",
  updated_at: "2026-03-14T10:00:00.000Z",
  last_active_at: "2026-03-14T10:00:00.000Z",
  expires_at: null,
};

const baseEnvironment: EnvironmentRecord = {
  workspace_id: "workspace_1",
  status: "idle",
  failure_reason: null,
  failed_at: null,
  created_at: "2026-03-14T10:00:00.000Z",
  updated_at: "2026-03-14T10:00:00.000Z",
};

const readyService: ServiceRecord = {
  id: "svc_1",
  environment_id: "workspace_1",
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
        environment: { ...baseEnvironment, status: "running" },
        services: [readyService],
      }),
    ).toEqual({ kind: "dot", tone: "success" });

    expect(
      getEnvironmentExtensionBadge({
        environment: { ...baseEnvironment, status: "starting" },
        services: [{ ...readyService, status: "starting" }],
      }),
    ).toEqual({ kind: "dot", tone: "warning" });

    expect(
      getEnvironmentExtensionBadge({
        environment: { ...baseEnvironment, failure_reason: "service_start_failed" },
        services: [{ ...readyService, status: "failed" }],
      }),
    ).toEqual({ kind: "dot", tone: "danger" });

    expect(
      getEnvironmentExtensionBadge({
        environment: baseEnvironment,
        services: [],
      }),
    ).toEqual({ kind: "dot", tone: "neutral" });
  });
});

describe("builtin extension slots", () => {
  test("declares git-owned canvas document kinds only for tab-backed history surfaces", () => {
    const slots = getBuiltinExtensionSlots({
      config: null,
      environment: baseEnvironment,
      gitStatus: undefined,
      hasManifest: false,
      launchActions: {
        openChangesDiff: () => {},
        openCommitDiff: () => {},
        openFileViewer: () => {},
        openPullRequest: () => {},
      },
      manifestState: "missing",
      onFocusTerminal: () => {},
      onRestart: async () => {},
      onRun: async () => {},
      onStop: async () => {},
      onSwitchToExtension: () => {},
      services: [],
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
