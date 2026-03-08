import { describe, expect, test } from "bun:test";
import type { StorageLike } from "./workspace-surface-state";
import {
  clearLastWorkspaceId,
  commitDiffTabKeyV2,
  createCommitDiffTab,
  createDefaultWorkspaceSurfaceState,
  createFileDiffTab,
  createLauncherTab,
  fileDiffTabKeyV2,
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
  test("migrates v1 snapshots and legacy diff active keys into the v2 model", () => {
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
      activeTabKey: fileDiffTabKeyV2("src/app.ts"),
      documents: [
        createFileDiffTab("src/app.ts", "working"),
        createFileDiffTab("README.md", "staged"),
      ],
    });

    writeWorkspaceSurfaceState("ws-1", restored, storage);

    expect(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY_V1)).toBeNull();
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2) ?? "null")).toEqual({
      "ws-1": {
        activeTabKey: fileDiffTabKeyV2("src/app.ts"),
        documents: [
          {
            activeScope: "working",
            filePath: "src/app.ts",
            initialScope: "working",
            type: "file-diff",
          },
          {
            activeScope: "staged",
            filePath: "README.md",
            initialScope: "staged",
            type: "file-diff",
          },
        ],
      },
    });
  });

  test("persists file diff tabs with file-path dedupe and active scope state", () => {
    const storage = new MemoryStorage();

    writeWorkspaceSurfaceState(
      "ws-1",
      withDefaultState({
        activeTabKey: "diff:staged:src/app.ts",
        documents: [
          createFileDiffTab("src/app.ts", "working"),
          createFileDiffTab("src/app.ts", "working", "staged"),
          createFileDiffTab("README.md", "staged"),
        ],
      }),
      storage,
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: fileDiffTabKeyV2("src/app.ts"),
      documents: [
        createFileDiffTab("src/app.ts", "working", "staged"),
        createFileDiffTab("README.md", "staged"),
      ],
    });
    expect(JSON.parse(storage.getItem(WORKSPACE_SURFACE_STATE_STORAGE_KEY_V2) ?? "null")).toEqual({
      "ws-1": {
        activeTabKey: fileDiffTabKeyV2("src/app.ts"),
        documents: [
          {
            activeScope: "staged",
            filePath: "src/app.ts",
            initialScope: "working",
            type: "file-diff",
          },
          {
            activeScope: "staged",
            filePath: "README.md",
            initialScope: "staged",
            type: "file-diff",
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

  test("persists launcher tabs alongside workspace-owned tab ordering", () => {
    const storage = new MemoryStorage();
    const launcher = createLauncherTab("launcher-1");

    writeWorkspaceSurfaceState(
      "ws-1",
      withDefaultState({
        activeTabKey: launcher.key,
        documents: [launcher, createFileDiffTab("src/app.ts", "working")],
        tabOrderKeys: [launcher.key, "diff:file:src/app.ts", "terminal:term-2"],
      }),
      storage,
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: launcher.key,
      documents: [launcher, createFileDiffTab("src/app.ts", "working")],
      hiddenRuntimeTabKeys: [],
      tabOrderKeys: [launcher.key, "diff:file:src/app.ts", "terminal:term-2"],
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
            activeScope: "working",
            filePath: "src/app.ts",
            initialScope: "working",
            type: "file-diff",
          },
        ],
        tabOrderKeys: [launcher.key, "diff:file:src/app.ts", "terminal:term-2"],
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
          tabOrderKeys: ["launcher:launcher-1", "terminal:term-hidden", "launcher:launcher-1"],
        },
      }),
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: null,
      documents: [createLauncherTab("launcher-1")],
      hiddenRuntimeTabKeys: ["terminal:term-hidden"],
      tabOrderKeys: ["launcher:launcher-1"],
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
              activeScope: "working",
              filePath: "src/app.ts",
              initialScope: "working",
              type: "file-diff",
            },
            {
              activeScope: "staged",
              filePath: "src/app.ts",
              initialScope: "working",
              type: "file-diff",
            },
            {
              activeScope: "working",
              filePath: "src/ignored.ts",
              initialScope: "invalid",
              type: "file-diff",
            },
            {
              activeScope: "working",
              filePath: 42,
              initialScope: "working",
              type: "file-diff",
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
            { filePath: "README.md", scope: "staged" },
            null,
          ],
        },
      }),
    );

    expect(readWorkspaceSurfaceState("ws-1", storage)).toEqual({
      ...createDefaultWorkspaceSurfaceState(),
      activeTabKey: fileDiffTabKeyV2("src/app.ts"),
      documents: [
        createFileDiffTab("src/app.ts", "working", "staged"),
        createCommitDiffTab(commit),
        createFileDiffTab("README.md", "staged"),
      ],
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
              activeScope: "working",
              filePath: "src/ignored.ts",
              initialScope: "invalid",
              type: "file-diff",
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
        activeTabKey: fileDiffTabKeyV2("src/app.ts"),
        documents: [createFileDiffTab("src/app.ts", "working")],
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
