import { describe, expect, test } from "bun:test";

import {
  createVisibleSidebarEntries,
  describeShellExit,
  formatTuiFatalError,
  formatWorkspaceTabLabel,
  flattenWorkspaceGroups,
  groupRepositoryWorkspaces,
  isTuiQuitKey,
  mergeLaunchEnvironment,
  pickSidebarEntryKey,
  pickTerminalId,
  pickWorkspaceId,
  repositorySidebarEntryKey,
  workspaceShortLabel,
} from "./opentui-helpers";

describe("OpenTUI helpers", () => {
  test("keeps the preferred workspace when it still exists", () => {
    expect(pickWorkspaceId([{ id: "ws_1" }, { id: "ws_2" }], "ws_2")).toBe("ws_2");
  });

  test("falls back to the first workspace when the preferred id is missing", () => {
    expect(pickWorkspaceId([{ id: "ws_1" }, { id: "ws_2" }], "ws_missing")).toBe("ws_1");
  });

  test("keeps the preferred terminal when it still exists", () => {
    expect(pickTerminalId([{ id: "@1" }, { id: "@2" }], "@2")).toBe("@2");
  });

  test("falls back to the first terminal when the preferred id is missing", () => {
    expect(pickTerminalId([{ id: "@1" }, { id: "@2" }], "@missing")).toBe("@1");
  });

  test("filters undefined env vars and overlays launch pairs", () => {
    expect(
      mergeLaunchEnvironment(
        {
          HOME: "/tmp/home",
          IGNORED: undefined,
        },
        [["TERM", "xterm-256color"]],
      ),
    ).toEqual({
      HOME: "/tmp/home",
      TERM: "xterm-256color",
    });
  });

  test("formats shell exits with signal context when present", () => {
    expect(describeShellExit(0)).toBe("Shell exited with code 0.");
    expect(describeShellExit(1, "SIGTERM")).toBe("Shell exited via SIGTERM.");
  });

  test("matches the global quit chords used by the tui shell", () => {
    expect(isTuiQuitKey({ ctrl: true, name: "c" })).toBe(false);
    expect(isTuiQuitKey({ ctrl: true, name: "q" })).toBe(true);
    expect(isTuiQuitKey({ ctrl: false, name: "q" })).toBe(false);
    expect(isTuiQuitKey({ ctrl: true, name: "x" })).toBe(false);
  });

  test("formats fatal tui errors into a bounded stack preview", () => {
    const error = new Error("boom");
    error.stack = "Error: boom\nline 1\nline 2\nline 3";

    expect(formatTuiFatalError(error, 2)).toBe("Error: boom\nline 1");
    expect(formatTuiFatalError("plain failure", 2)).toBe("plain failure");
  });

  test("formats workspace tab labels as a single compact line", () => {
    expect(formatWorkspaceTabLabel({ busy: false, title: "zsh" })).toBe("zsh");
    expect(formatWorkspaceTabLabel({ busy: true, title: "codex" })).toBe("* codex");
  });

  test("groups repository workspaces into the tui sidebar tree shape", () => {
    expect(
      groupRepositoryWorkspaces([
        {
          id: "repo_1",
          name: "Lifecycle",
          path: "/Users/kyle/dev/lifecycle",
          slug: "lifecycle",
          workspaces: [
            {
              host: "local",
              id: "ws_root",
              name: "main",
              path: "/Users/kyle/dev/lifecycle",
              ref: "main",
              slug: "main",
              status: "running",
            },
          ],
        },
      ]),
    ).toEqual([
      {
        id: "repo_1",
        name: "Lifecycle",
        path: "/Users/kyle/dev/lifecycle",
        slug: "lifecycle",
        workspaces: [
          {
            host: "local",
            id: "ws_root",
            name: "main",
            repositoryName: "Lifecycle",
            repositoryPath: "/Users/kyle/dev/lifecycle",
            repositorySlug: "lifecycle",
            slug: "main",
            sourceRef: "main",
            status: "running",
            workspacePath: "/Users/kyle/dev/lifecycle",
          },
        ],
      },
    ]);
  });

  test("flattens grouped workspaces for workspace selection logic", () => {
    expect(
      flattenWorkspaceGroups([
        {
          id: "repo_1",
          name: "Lifecycle",
          path: "/Users/kyle/dev/lifecycle",
          slug: "lifecycle",
          workspaces: [
            {
              host: "local",
              id: "ws_root",
              name: "main",
              repositoryName: "Lifecycle",
              repositoryPath: "/Users/kyle/dev/lifecycle",
              repositorySlug: "lifecycle",
              slug: "main",
              sourceRef: "main",
              status: "running",
              workspacePath: "/Users/kyle/dev/lifecycle",
            },
          ],
        },
      ]),
    ).toEqual([
      {
        host: "local",
        id: "ws_root",
        name: "main",
        repositoryName: "Lifecycle",
        repositoryPath: "/Users/kyle/dev/lifecycle",
        repositorySlug: "lifecycle",
        slug: "main",
        sourceRef: "main",
        status: "running",
        workspacePath: "/Users/kyle/dev/lifecycle",
      },
    ]);
  });

  test("creates visible sidebar entries with repo headers and expanded workspaces", () => {
    const entries = createVisibleSidebarEntries(
      groupRepositoryWorkspaces([
        {
          id: "repo_1",
          name: "Lifecycle",
          path: "/Users/kyle/dev/lifecycle",
          slug: "lifecycle",
          workspaces: [
            {
              host: "local",
              id: "ws_root",
              name: "main",
              path: "/Users/kyle/dev/lifecycle",
              ref: "main",
              slug: "main",
              status: "running",
            },
          ],
        },
      ]),
      new Set<string>(),
      "ws_root",
    );

    expect(entries).toEqual([
      {
        activeWorkspace: {
          host: "local",
          id: "ws_root",
          name: "main",
          repositoryName: "Lifecycle",
          repositoryPath: "/Users/kyle/dev/lifecycle",
          repositorySlug: "lifecycle",
          slug: "main",
          sourceRef: "main",
          status: "running",
          workspacePath: "/Users/kyle/dev/lifecycle",
        },
        isCollapsed: false,
        key: "repo:repo_1",
        kind: "repository",
        repository: {
          id: "repo_1",
          name: "Lifecycle",
          path: "/Users/kyle/dev/lifecycle",
          slug: "lifecycle",
          workspaces: [
            {
              host: "local",
              id: "ws_root",
              name: "main",
              repositoryName: "Lifecycle",
              repositoryPath: "/Users/kyle/dev/lifecycle",
              repositorySlug: "lifecycle",
              slug: "main",
              sourceRef: "main",
              status: "running",
              workspacePath: "/Users/kyle/dev/lifecycle",
            },
          ],
        },
      },
      {
        key: "workspace:ws_root",
        kind: "workspace",
        repositoryId: "repo_1",
        workspace: {
          host: "local",
          id: "ws_root",
          name: "main",
          repositoryName: "Lifecycle",
          repositoryPath: "/Users/kyle/dev/lifecycle",
          repositorySlug: "lifecycle",
          slug: "main",
          sourceRef: "main",
          status: "running",
          workspacePath: "/Users/kyle/dev/lifecycle",
        },
      },
    ]);
  });

  test("falls back to the active repo header when the selected workspace is collapsed", () => {
    const entries = createVisibleSidebarEntries(
      groupRepositoryWorkspaces([
        {
          id: "repo_1",
          name: "Lifecycle",
          path: "/Users/kyle/dev/lifecycle",
          slug: "lifecycle",
          workspaces: [
            {
              host: "local",
              id: "ws_root",
              name: "main",
              path: "/Users/kyle/dev/lifecycle",
              ref: "main",
              slug: "main",
              status: "running",
            },
          ],
        },
      ]),
      new Set(["repo_1"]),
      "ws_root",
    );

    expect(pickSidebarEntryKey(entries, "workspace:ws_missing", "ws_root")).toBe(
      repositorySidebarEntryKey("repo_1"),
    );
  });

  test("prefers the workspace slug when formatting a compact workspace label", () => {
    expect(
      workspaceShortLabel({
        host: "local",
        id: "ws_root",
        name: "main",
        repositoryName: "Lifecycle",
        repositoryPath: "/Users/kyle/dev/lifecycle",
        repositorySlug: "lifecycle",
        slug: "feature-x",
        sourceRef: "main",
        status: "running",
        workspacePath: "/Users/kyle/dev/lifecycle",
      }),
    ).toBe("feature-x");
  });
});
