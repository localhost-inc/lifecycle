import { describe, expect, test } from "bun:test";
import type { StorageLike } from "./workspace-surface-state";
import {
  changesDiffTabKeyV2,
  clearLastWorkspaceId,
  commitDiffTabKeyV2,
  createChangesDiffTab,
  createCommitDiffTab,
  createDefaultWorkspaceSurfaceState,
  createLauncherTab,
  readLastWorkspaceId,
  readWorkspaceSurfaceState,
  writeLastWorkspaceId,
  writeWorkspaceSurfaceState,
} from "./workspace-surface-state";

const WORKSPACE_SURFACE_STATE_STORAGE_KEY_V1 = "lifecycle.desktop.workspace-surface.v1";
const WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2 = "lifecycle.desktop.workspace-surface.v2";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function withDefaultState(state: Partial<ReturnType<typeof createDefaultWorkspaceSurfaceState>>) {
  return {
    ...createDefaultWorkspaceSurfaceState(),
    ...state,
  };
}

function createCommitEntry(overrides: Partial<ReturnType<typeof createCommitDiffTab>> = {}) {
  return {
    author: "Lifecycle",
    message: "feat: add unified diff tabs",
    sha: "0123456789abcdef0123456789abcdef01234567",
    shortSha: "01234567",
    timestamp: "2026-03-07T12:00:00.000Z",
    ...overrides,
  };
}

describe("workspace surface state persistence", () => {
  test("migrates v1 snapshots and legacy diff active keys into one changes tab", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      WORKSPACE_SURFACE_STATE_STORAGE_KEY_V1,
      JSON.stringify({
        "ws-1": {
          activeTabKey: "diff:staged:src/app.ts",
          documents: [
            { filePath: "src/app.ts", scope: "working" },
            { filePath: "README.md", scope: "staged" },
          ],
        },
      }),
    );

    const restored = readWorkspaceSurfaceState("ws-1", storage);
    expect(restored).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: changesDiffTabKeyV2,
      documents: [createChangesDiffTab("src/app.ts")],
    });

    writeWorkspaceSurfaceState("ws-1", restored, storage);

    expect(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY_V1)).toBeNull();
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2) ?? "null")).toEqual({
      "ws-1": {
        activeTabKey: changesDiffTabKeyV2,
        documents: [
          {
            focusPath: "src/app.ts",
            type: "changes-diff",
          },
        ],
      },
    });
  });

  test("collapses persisted legacy file diffs to the first diff path when none is active", () => {
    const storage = new MemoryStorage();
    const firstCommit = createCommitEntry();

    storage.setItem(
      WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2,
      JSON.stringify({
        "ws-1": {
          activeTabKey: commitDiffTabKeyV2(firstCommit.sha),
          documents: [
            // Legacy file-scoped diff tabs should collapse into one changes tab.
            {
              type: "file-diff",
              filePath: "src/first.ts",
            },
            {
              type: "commit-diff",
              author: firstCommit.author,
              message: firstCommit.message,
              sha: firstCommit.sha,
              shortSha: firstCommit.shortSha,
              timestamp: firstCommit.timestamp,
            },
            {
              type: "file-diff",
              filePath: "src/second.ts",
            },
          ],
        },
      }),
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: commitDiffTabKeyV2(firstCommit.sha),
      documents: [createChangesDiffTab("src/first.ts"), createCommitDiffTab(firstCommit)],
    });
  });

  test("persists a single changes diff tab with fixed labeling and focus path", () => {
    const storage = new MemoryStorage();

    writeWorkspaceSurfaceState(
      "ws-1",
      withDefaultState({
        activeTabKey: changesDiffTabKeyV2,
        documents: [createChangesDiffTab("src/app.ts"), createChangesDiffTab("README.md")],
      }),
      storage,
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: changesDiffTabKeyV2,
      documents: [createChangesDiffTab("README.md")],
    });
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2) ?? "null")).toEqual({
      "ws-1": {
        activeTabKey: changesDiffTabKeyV2,
        documents: [
          {
            focusPath: "README.md",
            type: "changes-diff",
          },
        ],
      },
    });
  });

  test("persists commit diff tabs with sha-based dedupe", () => {
    const storage = new MemoryStorage();
    const firstCommit = createCommitEntry();
    const secondCommit = createCommitEntry({
      author: "Another Author",
      message: "fix: keep commit tab metadata",
      sha: "fedcba9876543210fedcba9876543210fedcba98",
      shortSha: "fedcba98",
      timestamp: "2026-03-06T10:30:00.000Z",
    });

    writeWorkspaceSurfaceState(
      "ws-1",
      withDefaultState({
        activeTabKey: commitDiffTabKeyV2(firstCommit.sha),
        documents: [
          createCommitDiffTab(firstCommit),
          createCommitDiffTab(secondCommit),
          createCommitDiffTab(firstCommit),
        ],
      }),
      storage,
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: commitDiffTabKeyV2(firstCommit.sha),
      documents: [createCommitDiffTab(firstCommit), createCommitDiffTab(secondCommit)],
    });
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2) ?? "null")).toEqual({
      "ws-1": {
        activeTabKey: commitDiffTabKeyV2(firstCommit.sha),
        documents: [
          {
            author: firstCommit.author,
            type: "commit-diff",
            message: firstCommit.message,
            sha: firstCommit.sha,
            shortSha: firstCommit.shortSha,
            timestamp: firstCommit.timestamp,
          },
          {
            author: secondCommit.author,
            type: "commit-diff",
            message: secondCommit.message,
            sha: secondCommit.sha,
            shortSha: secondCommit.shortSha,
            timestamp: secondCommit.timestamp,
          },
        ],
      },
    });
  });

  test("persists runtime active tabs even when no document tabs are open", () => {
    const storage = new MemoryStorage();

    writeWorkspaceSurfaceState(
      "ws-1",
      withDefaultState({
        activeTabKey: "terminal:term-42",
        documents: [],
      }),
      storage,
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: "terminal:term-42",
      documents: [],
    });
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2) ?? "null")).toEqual({
      "ws-1": {
        activeTabKey: "terminal:term-42",
        documents: [],
      },
    });
  });

  test("preserves launcher tabs alongside workspace-owned tab ordering", () => {
    const storage = new MemoryStorage();
    const launcher = createLauncherTab("launcher-1");

    writeWorkspaceSurfaceState(
      "ws-1",
      withDefaultState({
        activeTabKey: launcher.key,
        documents: [launcher, createChangesDiffTab("src/app.ts")],
        tabOrderKeys: [launcher.key, changesDiffTabKeyV2, "terminal:term-2"],
      }),
      storage,
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: launcher.key,
      documents: [launcher, createChangesDiffTab("src/app.ts")],
      hiddenRuntimeTabKeys: [],
      tabOrderKeys: [launcher.key, changesDiffTabKeyV2, "terminal:term-2"],
    });
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2) ?? "null")).toEqual({
      "ws-1": {
        activeTabKey: launcher.key,
        documents: [
          {
            key: launcher.key,
            type: "launcher",
          },
          {
            focusPath: "src/app.ts",
            type: "changes-diff",
          },
        ],
        tabOrderKeys: [launcher.key, changesDiffTabKeyV2, "terminal:term-2"],
      },
    });
  });

  test("keeps hidden runtime tabs separate from visible order and clears invalid active runtime keys", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2,
      JSON.stringify({
        "ws-1": {
          activeTabKey: "terminal:term-hidden",
          documents: [createLauncherTab("launcher-1")],
          hiddenRuntimeTabKeys: ["terminal:term-hidden", "diff:file:src/ignored.ts"],
          tabOrderKeys: ["launcher:launcher-1", "terminal:term-hidden", changesDiffTabKeyV2],
        },
      }),
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: null,
      documents: [createLauncherTab("launcher-1")],
      hiddenRuntimeTabKeys: ["terminal:term-hidden"],
      tabOrderKeys: ["launcher:launcher-1", changesDiffTabKeyV2],
    });
  });

  test("filters invalid persisted payloads while preserving valid migrated documents", () => {
    const storage = new MemoryStorage();
    const commit = createCommitEntry();

    storage.setItem(
      WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2,
      JSON.stringify({
        "ws-1": {
          activeTabKey: "diff:working:src/app.ts",
          documents: [
            {
              type: "changes-diff",
              focusPath: "src/existing.ts",
            },
            // Legacy diff payloads still need restore coverage until older persisted state ages out.
            {
              filePath: "src/app.ts",
              scope: "working",
            },
            {
              type: "file-diff",
              filePath: "README.md",
            },
            {
              type: "file-diff",
              filePath: 42,
            },
            {
              author: commit.author,
              type: "commit-diff",
              message: commit.message,
              sha: commit.sha,
              shortSha: commit.shortSha,
              timestamp: commit.timestamp,
            },
            { type: "commit-diff", sha: "" },
            { type: "commit-diff", sha: 42 },
            {
              author: 42,
              type: "commit-diff",
              message: "bad author",
              sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
              shortSha: "deadbeef",
              timestamp: "2026-03-07T13:00:00.000Z",
            },
            null,
          ],
        },
      }),
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: changesDiffTabKeyV2,
      documents: [createChangesDiffTab("src/app.ts"), createCommitDiffTab(commit)],
    });
  });

  test("prefers the active legacy diff key when restoring a collapsed changes tab", () => {
    const storage = new MemoryStorage();
    const commit = createCommitEntry();

    storage.setItem(
      WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2,
      JSON.stringify({
        "ws-1": {
          activeTabKey: "diff:file:src/missing.ts",
          documents: [
            {
              type: "file-diff",
              filePath: "README.md",
            },
            {
              type: "commit-diff",
              author: commit.author,
              message: commit.message,
              sha: commit.sha,
              shortSha: commit.shortSha,
              timestamp: commit.timestamp,
            },
          ],
        },
      }),
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: changesDiffTabKeyV2,
      documents: [createChangesDiffTab("src/missing.ts"), createCommitDiffTab(commit)],
    });
  });

  test("preserves persisted runtime active tabs while filtering invalid documents", () => {
    const storage = new MemoryStorage();

    storage.setItem(
      WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2,
      JSON.stringify({
        "ws-1": {
          activeTabKey: "terminal:term-42",
          documents: [
            {
              type: "file-diff",
              filePath: 42,
            },
          ],
        },
      }),
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: "terminal:term-42",
      documents: [],
    });
  });

  test("removes empty workspace state snapshots", () => {
    const storage = new MemoryStorage();

    writeWorkspaceSurfaceState(
      "ws-1",
      withDefaultState({
        activeTabKey: changesDiffTabKeyV2,
        documents: [createChangesDiffTab("src/app.ts")],
      }),
      storage,
    );
    writeWorkspaceSurfaceState("ws-1", createDefaultWorkspaceSurfaceState(), storage);

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual(
      createDefaultWorkspaceSurfaceState(),
    );
    expect(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY_V1)).toBeNull();
    expect(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2)).toBeNull();
  });

  test("persists and clears the last selected workspace id", () => {
    const storage = new MemoryStorage();

    expect(readLastWorkspaceId(storage)).toBeNull();

    writeLastWorkspaceId("ws-9", storage);
    expect(readLastWorkspaceId(storage)).toBe("ws-9");

    clearLastWorkspaceId(storage);
    expect(readLastWorkspaceId(storage)).toBeNull();
  });
});
