import { describe, expect, test } from "bun:test";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { createWorkspaceHostRegistry } from "./index";
import type { WorkspaceHostAdapter } from "./host";
import { CloudWorkspaceHost } from "./hosts/cloud";
import { type LocalHostDeps, LocalWorkspaceHost } from "./hosts/local";
import { MANAGED_TMUX_SOCKET_NAME, normalizeTmuxTerminalId } from "../terminal/tmux-runtime";

describe("workspace contract", () => {
  function workspace(overrides: Partial<WorkspaceRecord> = {}): WorkspaceRecord {
    return {
      id: "ws_1",
      repository_id: "project_1",
      name: "Workspace 1",
      slug: "workspace-1",
      checkout_type: "worktree",
      source_ref: "lifecycle/workspace-1",
      git_sha: null,
      workspace_root: "/tmp/project_1/.worktrees/ws_1",
      host: "local",
      manifest_fingerprint: "manifest_1",
      created_at: "2026-03-12T00:00:00.000Z",
      updated_at: "2026-03-12T00:00:00.000Z",
      last_active_at: "2026-03-12T00:00:00.000Z",
      prepared_at: null,
      status: "active",
      failure_reason: null,
      failed_at: null,
      ...overrides,
    };
  }

  const REPO_PATH = "/tmp/project_1/.worktrees/ws_1";

  test("defines the expected workspace method names", () => {
    const requiredMethods: Array<keyof WorkspaceHostAdapter> = [
      "execCommand",
      "resolveShellRuntime",
      "resolveTerminalRuntime",
      "listTerminals",
      "createTerminal",
      "closeTerminal",
      "connectTerminal",
      "disconnectTerminal",
      "startStack",
      "stopStack",
      "readManifest",
      "getGitCurrentBranch",
      "ensureWorkspace",
      "renameWorkspace",
      "inspectArchive",
      "archiveWorkspace",
      "readFile",
      "writeFile",
      "subscribeFileEvents",
      "listFiles",
      "openFile",
      "openInApp",
      "listOpenInApps",
      "getGitStatus",
      "getGitScopePatch",
      "getGitChangesPatch",
      "getGitDiff",
      "listGitLog",
      "listGitPullRequests",
      "getGitPullRequest",
      "getCurrentGitPullRequest",
      "getGitBaseRef",
      "getGitRefDiffPatch",
      "getGitPullRequestPatch",
      "getGitCommitPatch",
      "stageGitFiles",
      "unstageGitFiles",
      "commitGit",
      "pushGit",
      "createGitPullRequest",
      "mergeGitPullRequest",
    ];

    expect(requiredMethods).toHaveLength(41);
  });

  test("host client exposes the full contract surface", () => {
    const invoke = async () => "";
    const client = new LocalWorkspaceHost({ invoke });

    expect(typeof client.execCommand).toBe("function");
    expect(typeof client.resolveShellRuntime).toBe("function");
    expect(typeof client.resolveTerminalRuntime).toBe("function");
    expect(typeof client.listTerminals).toBe("function");
    expect(typeof client.createTerminal).toBe("function");
    expect(typeof client.closeTerminal).toBe("function");
    expect(typeof client.connectTerminal).toBe("function");
    expect(typeof client.disconnectTerminal).toBe("function");
    expect(typeof client.startStack).toBe("function");
    expect(typeof client.stopStack).toBe("function");
    expect(typeof client.readManifest).toBe("function");
    expect(typeof client.getGitCurrentBranch).toBe("function");
    expect(typeof client.ensureWorkspace).toBe("function");
    expect(typeof client.renameWorkspace).toBe("function");
    expect(typeof client.inspectArchive).toBe("function");
    expect(typeof client.archiveWorkspace).toBe("function");

    expect(typeof client.readFile).toBe("function");
    expect(typeof client.writeFile).toBe("function");
    expect(typeof client.subscribeFileEvents).toBe("function");
    expect(typeof client.listFiles).toBe("function");
    expect(typeof client.openFile).toBe("function");
    expect(typeof client.openInApp).toBe("function");
    expect(typeof client.listOpenInApps).toBe("function");
    expect(typeof client.getGitStatus).toBe("function");
    expect(typeof client.getGitScopePatch).toBe("function");
    expect(typeof client.getGitChangesPatch).toBe("function");
    expect(typeof client.getGitDiff).toBe("function");
    expect(typeof client.listGitLog).toBe("function");
    expect(typeof client.listGitPullRequests).toBe("function");
    expect(typeof client.getGitPullRequest).toBe("function");
    expect(typeof client.getCurrentGitPullRequest).toBe("function");
    expect(typeof client.getGitBaseRef).toBe("function");
    expect(typeof client.getGitRefDiffPatch).toBe("function");
    expect(typeof client.getGitPullRequestPatch).toBe("function");
    expect(typeof client.getGitCommitPatch).toBe("function");
    expect(typeof client.stageGitFiles).toBe("function");
    expect(typeof client.unstageGitFiles).toBe("function");
    expect(typeof client.commitGit).toBe("function");
    expect(typeof client.pushGit).toBe("function");
    expect(typeof client.createGitPullRequest).toBe("function");
    expect(typeof client.mergeGitPullRequest).toBe("function");
  });

  test("local host client delegates stack execution through the injected stack controller", async () => {
    const startCalls: unknown[] = [];
    const stopCalls: unknown[] = [];
    const client = new LocalWorkspaceHost({
      invoke: async () => "",
      stackController: {
        start: async (config, input) => {
          startCalls.push({ config, input });
          return {
            preparedAt: null,
            startedServices: [{ assignedPort: 3000, name: "web", processId: 12345 }],
          };
        },
        stop: async (stackId, names) => {
          stopCalls.push({ stackId, names });
        },
      },
    });
    const targetWorkspace = workspace();
    const config = {
      workspace: { prepare: [], teardown: [] },
      stack: { nodes: {} },
    };
    const input = {
      hostLabel: "workspace-1",
      logScope: { repositorySlug: "project-1", workspaceSlug: "workspace-1" },
      name: targetWorkspace.name,
      prepared: false,
      readyServiceNames: [],
      rootPath: REPO_PATH,
      services: [],
      sourceRef: targetWorkspace.source_ref,
      stackId: targetWorkspace.id,
    };

    const startResult = await client.startStack(targetWorkspace, config, input);
    await client.stopStack(targetWorkspace, { names: ["web"] });

    expect(startCalls).toEqual([{ config, input }]);
    expect(stopCalls).toEqual([{ names: ["web"], stackId: targetWorkspace.id }]);
    expect(startResult.startedServices).toEqual([
      { assignedPort: 3000, name: "web", processId: 12345 },
    ]);
  });

  test("local runtime sets up file watching via watchPath", async () => {
    let watchedPath = "";
    const client = new LocalWorkspaceHost({
      invoke: async () => "",
      watchPath: async (path, _callback, _options) => {
        watchedPath = path;
        return () => {};
      },
    });

    const cleanup = await client.subscribeFileEvents(
      {
        workspaceId: "ws_1",
        workspaceRoot: "/tmp/project_1/.worktrees/ws_1",
      },
      () => {},
    );

    expect(watchedPath).toBe("/tmp/project_1/.worktrees/ws_1");
    expect(typeof cleanup).toBe("function");
  });

  test("cloud host client forwards exec through the injected workspace executor", async () => {
    const calls: Array<{ workspaceId: string; command: string[] }> = [];
    const client = new CloudWorkspaceHost({
      execWorkspaceCommand: async (workspaceId, command) => {
        calls.push({ workspaceId, command });
        return {
          exitCode: 0,
          stderr: "",
          stdout: "ok\n",
        };
      },
      getShellConnection: async () => ({
        cwd: "/workspace",
        home: "/home/lifecycle",
        host: "ssh.app.lifecycle.test",
        token: "tok_123",
      }),
    });

    const result = await client.execCommand(workspace({ host: "cloud" }), [
      "tmux",
      "list-panes",
      "-F",
      "#{pane_current_command}",
    ]);

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "ok\n",
    });
    expect(calls).toEqual([
      {
        workspaceId: "ws_1",
        command: ["tmux", "list-panes", "-F", "#{pane_current_command}"],
      },
    ]);
  });

  test("local host client preserves argv exactly for exec commands", async () => {
    const calls: Array<{ program: string; args: string[]; cwd: string | URL | undefined }> = [];
    const spawnSyncMock = ((
      program: string,
      args?: readonly string[],
      options?: { cwd?: string | URL },
    ) => {
      calls.push({
        program,
        args: [...(args ?? [])],
        cwd: options?.cwd,
      });
      const finalArg = args?.at(-1);
      return {
        error: undefined,
        status: 0,
        stderr: "",
        stdout: typeof finalArg === "string" ? finalArg : "",
      };
    }) as unknown as NonNullable<LocalHostDeps["spawnSync"]>;
    const client = new LocalWorkspaceHost({
      invoke: async () => "",
      spawnSync: spawnSyncMock,
    });

    const result = await client.execCommand(workspace(), [
      "tmux",
      "list-panes",
      "-F",
      "pane\tactivity",
    ]);

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "pane\tactivity",
    });
    expect(calls).toEqual([
      {
        program: "tmux",
        args: ["list-panes", "-F", "pane\tactivity"],
        cwd: REPO_PATH,
      },
    ]);
  });

  test("cloud host client requires a workspace id for exec", async () => {
    const client = new CloudWorkspaceHost({
      execWorkspaceCommand: async () => ({
        exitCode: 0,
        stderr: "",
        stdout: "",
      }),
      getShellConnection: async () => ({
        cwd: "/workspace",
        home: "/home/lifecycle",
        host: "ssh.app.lifecycle.test",
        token: "tok_123",
      }),
    });

    await expect(client.execCommand(workspace({ host: "cloud", id: "" }), ["pwd"])).rejects.toThrow(
      "Cloud workspace commands require a workspace id.",
    );
  });

  test("cloud host client rejects stack execution through the workspace boundary", async () => {
    const client = new CloudWorkspaceHost({
      execWorkspaceCommand: async () => ({
        exitCode: 0,
        stderr: "",
        stdout: "",
      }),
      getShellConnection: async () => ({
        cwd: "/workspace",
        home: "/home/lifecycle",
        host: "ssh.app.lifecycle.test",
        token: "tok_123",
      }),
    });

    await expect(
      client.startStack(
        workspace({ host: "cloud" }),
        { workspace: { prepare: [], teardown: [] }, stack: { nodes: {} } },
        {
          hostLabel: "workspace-1",
          logScope: { repositorySlug: "project-1", workspaceSlug: "workspace-1" },
          name: "Workspace 1",
          prepared: false,
          readyServiceNames: [],
          rootPath: "/workspace",
          services: [],
          sourceRef: "lifecycle/workspace-1",
          stackId: "ws_1",
        },
      ),
    ).rejects.toThrow("CloudWorkspaceHost.startStack is not implemented");
  });

  test("local host client resolves a direct shell runtime without tmux", async () => {
    const client = new LocalWorkspaceHost({ invoke: async () => "" });

    const runtime = await client.resolveShellRuntime(workspace(), {});

    expect(runtime).toEqual({
      backendLabel: "local shell",
      launchError: null,
      persistent: false,
      sessionName: null,
      prepare: null,
      spec: {
        program: process.env.SHELL || "/bin/bash",
        args: [],
        cwd: REPO_PATH,
        env: [["TERM", "xterm-256color"]],
      },
    });
  });

  test("local host client resolves a tmux runtime that prefers the latest client size", async () => {
    const client = new LocalWorkspaceHost({ invoke: async () => "" });

    const runtime = await client.resolveShellRuntime(workspace(), {
      sessionName: "lc-local-session",
    });

    expect(runtime.backendLabel).toBe("local tmux");
    expect(runtime.launchError).toBeNull();
    expect(runtime.persistent).toBe(true);
    expect(runtime.sessionName).toBe("lc-local-session");
    expect(runtime.spec).toEqual({
      program: "tmux",
      args: [
        "new-session",
        "-A",
        "-s",
        "lc-local-session",
        "-c",
        REPO_PATH,
        ";",
        "set-option",
        "-t",
        "lc-local-session",
        "window-size",
        "latest",
      ],
      cwd: REPO_PATH,
      env: [["TERM", "xterm-256color"]],
    });
  });

  test("local host client resolves a managed tmux runtime with a Lifecycle-owned profile", async () => {
    const spawnSyncMock = ((program: string, args?: readonly string[]) => {
      if (
        program === "sh" &&
        args?.[0] === "-lc" &&
        args[1]?.includes("command -v '/opt/lifecycle/bin/tmux'")
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      return { error: undefined, status: 0, stderr: "", stdout: "" };
    }) as unknown as NonNullable<LocalHostDeps["spawnSync"]>;
    const client = new LocalWorkspaceHost({
      invoke: async () => "",
      spawnSync: spawnSyncMock,
    });

    const runtime = await client.resolveShellRuntime(workspace(), {
      sessionName: "lc-local-session",
      persistenceMode: "managed",
      persistenceExecutablePath: "/opt/lifecycle/bin/tmux",
    });

    expect(runtime.spec).toEqual({
      program: "/opt/lifecycle/bin/tmux",
      args: [
        "-L",
        MANAGED_TMUX_SOCKET_NAME,
        "-f",
        "/dev/null",
        "new-session",
        "-A",
        "-s",
        "lc-local-session",
        "-c",
        REPO_PATH,
        ";",
        "set-option",
        "-t",
        "lc-local-session",
        "status",
        "off",
        ";",
        "set-option",
        "-t",
        "lc-local-session",
        "window-size",
        "latest",
      ],
      cwd: REPO_PATH,
      env: [
        ["TERM", "xterm-256color"],
        ["TMUX", ""],
        ["TMUX_PANE", ""],
      ],
    });
  });

  test("local host client fails fast for an unsupported persistence backend", async () => {
    const client = new LocalWorkspaceHost({ invoke: async () => "" });

    const runtime = await client.resolveShellRuntime(workspace(), {
      sessionName: "lc-local-session",
      persistenceBackend: "zellij",
      persistenceMode: "managed",
    });

    expect(runtime).toEqual({
      backendLabel: "local shell",
      launchError: 'Lifecycle terminal persistence backend "zellij" is not supported yet.',
      persistent: false,
      sessionName: null,
      prepare: null,
      spec: null,
    });
  });

  test("cloud host client resolves a tmux-backed shell runtime with prepare and attach steps", async () => {
    const client = new CloudWorkspaceHost({
      execWorkspaceCommand: async () => ({
        exitCode: 0,
        stderr: "",
        stdout: "",
      }),
      getShellConnection: async () => ({
        cwd: "/workspace/repo",
        home: "/home/lifecycle",
        host: "ssh.app.lifecycle.test",
        token: "tok_123",
      }),
    });

    const runtime = await client.resolveShellRuntime(workspace({ host: "cloud" }), {
      sessionName: "lc-cloud-session",
      syncEnvironment: ["export FOO=bar"],
      persistenceMode: "managed",
      persistenceExecutablePath: "/usr/local/bin/tmux",
    });

    expect(runtime.backendLabel).toBe("cloud tmux");
    expect(runtime.launchError).toBeNull();
    expect(runtime.persistent).toBe(true);
    expect(runtime.sessionName).toBe("lc-cloud-session");
    expect(runtime.prepare).not.toBeNull();
    expect(runtime.prepare?.program).toBe("ssh");
    expect(runtime.prepare?.args.at(-1)).toContain("/usr/local/bin/tmux");
    expect(runtime.prepare?.args.at(-1)).toContain(MANAGED_TMUX_SOCKET_NAME);
    expect(runtime.prepare?.args.at(-1)).toContain("has-session");
    expect(runtime.prepare?.args.at(-1)).toContain("lc-cloud-session");
    expect(runtime.prepare?.args.at(-1)).toContain("export FOO=bar");
    expect(runtime.spec?.program).toBe("ssh");
    expect(runtime.spec?.args.at(-1)).toContain("/usr/local/bin/tmux");
    expect(runtime.spec?.args.at(-1)).toContain("attach-session");
    expect(runtime.spec?.args.at(-1)).toContain("lc-cloud-session");
  });

  test("local host client lists tmux-backed terminal records through the terminal runtime", async () => {
    const calls: Array<{ args: string[]; program: string }> = [];
    const spawnSyncMock = ((program: string, args?: readonly string[]) => {
      const commandArgs = [...(args ?? [])];
      calls.push({ program, args: commandArgs });

      if (
        program === "sh" &&
        commandArgs[0] === "-lc" &&
        commandArgs[1]?.includes("command -v 'tmux'")
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      if (
        program === "sh" &&
        commandArgs[0] === "-lc" &&
        commandArgs[1]?.includes("'tmux' 'has-session'")
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      if (program === "tmux" && commandArgs[0] === "list-windows") {
        return {
          error: undefined,
          status: 0,
          stderr: "",
          stdout: "@1\tshell\t0\t1\n@2\tcodex\t1\t0\n",
        };
      }

      return { error: undefined, status: 0, stderr: "", stdout: "" };
    }) as unknown as NonNullable<LocalHostDeps["spawnSync"]>;
    const client = new LocalWorkspaceHost({
      invoke: async () => "",
      spawnSync: spawnSyncMock,
    });

    const terminals = await client.listTerminals(workspace(), {
      sessionName: "lc-local-session",
    });

    expect(terminals).toEqual([
      {
        id: "@1",
        title: "shell",
        kind: "shell",
        busy: false,
      },
      {
        id: "@2",
        title: "codex",
        kind: "codex",
        busy: true,
      },
    ]);
    expect(calls.some((call) => call.program === "tmux" && call.args[0] === "list-windows")).toBe(
      true,
    );
  });

  test("local host client returns an isolated spawn connection for a terminal", async () => {
    const spawnSyncMock = ((program: string, args?: readonly string[]) => {
      if (program === "sh" && args?.[0] === "-lc" && args[1]?.includes("command -v 'tmux'")) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      return { error: undefined, status: 0, stderr: "", stdout: "" };
    }) as unknown as NonNullable<LocalHostDeps["spawnSync"]>;
    const client = new LocalWorkspaceHost({
      invoke: async () => "",
      spawnSync: spawnSyncMock,
    });

    const connection = await client.connectTerminal(workspace(), {
      sessionName: "lc-local-session",
      terminalId: "@2",
      clientId: "surface-A",
      access: "interactive",
      preferredTransport: "spawn",
    });

    expect(connection.launchError).toBeNull();
    expect(connection.connectionId).toBe("lc-local-session--conn--surface-A--_2");
    expect(connection.transport).toEqual({
      kind: "spawn",
      prepare: {
        program: "sh",
        args: ["-lc", expect.stringContaining("lc-local-session--conn--surface-A--_2")],
        cwd: REPO_PATH,
        env: [["TERM", "xterm-256color"]],
      },
      spec: {
        program: "tmux",
        args: ["attach-session", "-t", "lc-local-session--conn--surface-A--_2"],
        cwd: REPO_PATH,
        env: [["TERM", "xterm-256color"]],
      },
    });
  });

  test("local host client canonicalizes polluted terminal ids before connecting", async () => {
    const spawnSyncMock = ((program: string, args?: readonly string[]) => {
      if (program === "sh" && args?.[0] === "-lc" && args[1]?.includes("command -v 'tmux'")) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      return { error: undefined, status: 0, stderr: "", stdout: "" };
    }) as unknown as NonNullable<LocalHostDeps["spawnSync"]>;
    const client = new LocalWorkspaceHost({
      invoke: async () => "",
      spawnSync: spawnSyncMock,
    });

    const connection = await client.connectTerminal(workspace(), {
      sessionName: "lc-local-session",
      terminalId: "@8_Tab_4_0_0",
      clientId: "surface-A",
      access: "interactive",
      preferredTransport: "spawn",
    });

    expect(connection.terminalId).toBe("@8");
    expect(connection.connectionId).toBe("lc-local-session--conn--surface-A--_8");
    expect(connection.transport).toEqual({
      kind: "spawn",
      prepare: {
        program: "sh",
        args: [
          "-lc",
          expect.stringContaining(
            "'select-window' '-t' 'lc-local-session--conn--surface-A--_8:@8'",
          ),
        ],
        cwd: REPO_PATH,
        env: [["TERM", "xterm-256color"]],
      },
      spec: {
        program: "tmux",
        args: ["attach-session", "-t", "lc-local-session--conn--surface-A--_8"],
        cwd: REPO_PATH,
        env: [["TERM", "xterm-256color"]],
      },
    });
  });

  test("local host client scrubs outer tmux env for managed terminal connections", async () => {
    const spawnSyncMock = ((program: string, args?: readonly string[]) => {
      if (
        program === "sh" &&
        args?.[0] === "-lc" &&
        args[1]?.includes("command -v '/opt/lifecycle/bin/tmux'")
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      return { error: undefined, status: 0, stderr: "", stdout: "" };
    }) as unknown as NonNullable<LocalHostDeps["spawnSync"]>;
    const client = new LocalWorkspaceHost({
      invoke: async () => "",
      spawnSync: spawnSyncMock,
    });

    const connection = await client.connectTerminal(workspace(), {
      sessionName: "lc-local-session",
      terminalId: "@2",
      clientId: "surface-A",
      access: "interactive",
      preferredTransport: "spawn",
      persistenceMode: "managed",
      persistenceExecutablePath: "/opt/lifecycle/bin/tmux",
    });

    expect(connection.transport).toEqual({
      kind: "spawn",
      prepare: {
        program: "sh",
        args: ["-lc", expect.stringContaining("lc-local-session--conn--surface-A--_2")],
        cwd: REPO_PATH,
        env: [
          ["TERM", "xterm-256color"],
          ["TMUX", ""],
          ["TMUX_PANE", ""],
        ],
      },
      spec: {
        program: "/opt/lifecycle/bin/tmux",
        args: [
          "-L",
          MANAGED_TMUX_SOCKET_NAME,
          "-f",
          "/dev/null",
          "attach-session",
          "-t",
          "lc-local-session--conn--surface-A--_2",
        ],
        cwd: REPO_PATH,
        env: [
          ["TERM", "xterm-256color"],
          ["TMUX", ""],
          ["TMUX_PANE", ""],
        ],
      },
    });
  });

  test("local host client uses the managed tmux profile for terminal listing", async () => {
    const calls: Array<{ args: string[]; program: string }> = [];
    const spawnSyncMock = ((program: string, args?: readonly string[]) => {
      const commandArgs = [...(args ?? [])];
      calls.push({ program, args: commandArgs });

      if (
        program === "sh" &&
        commandArgs[0] === "-lc" &&
        commandArgs[1]?.includes("command -v '/opt/lifecycle/bin/tmux'")
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      if (
        program === "sh" &&
        commandArgs[0] === "-lc" &&
        commandArgs[1]?.includes(
          `'/opt/lifecycle/bin/tmux' '-L' '${MANAGED_TMUX_SOCKET_NAME}' '-f' '/dev/null' 'has-session'`,
        )
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      if (program === "/opt/lifecycle/bin/tmux" && commandArgs[4] === "list-windows") {
        return {
          error: undefined,
          status: 0,
          stderr: "",
          stdout: "@1\tshell\t0\t1\n",
        };
      }

      return { error: undefined, status: 0, stderr: "", stdout: "" };
    }) as unknown as NonNullable<LocalHostDeps["spawnSync"]>;
    const client = new LocalWorkspaceHost({
      invoke: async () => "",
      spawnSync: spawnSyncMock,
    });

    const terminals = await client.listTerminals(workspace(), {
      sessionName: "lc-local-session",
      persistenceMode: "managed",
      persistenceExecutablePath: "/opt/lifecycle/bin/tmux",
    });

    expect(terminals).toEqual([
      {
        id: "@1",
        title: "shell",
        kind: "shell",
        busy: false,
      },
    ]);
    expect(
      calls.some(
        (call) =>
          call.program === "/opt/lifecycle/bin/tmux" &&
          call.args.slice(0, 5).join(" ") ===
            `-L ${MANAGED_TMUX_SOCKET_NAME} -f /dev/null list-windows`,
      ),
    ).toBe(true);
  });

  test("local host client resolves a created terminal from a fresh listing", async () => {
    const spawnSyncMock = ((program: string, args?: readonly string[]) => {
      const commandArgs = [...(args ?? [])];

      if (
        program === "sh" &&
        commandArgs[0] === "-lc" &&
        commandArgs[1]?.includes("command -v 'tmux'")
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      if (
        program === "sh" &&
        commandArgs[0] === "-lc" &&
        commandArgs[1]?.includes("'tmux' 'has-session'")
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      if (program === "tmux" && commandArgs[0] === "new-window") {
        return {
          error: undefined,
          status: 0,
          stderr: "",
          stdout: "@8 Tab 4 0 0\n",
        };
      }

      if (program === "tmux" && commandArgs[0] === "list-windows") {
        return {
          error: undefined,
          status: 0,
          stderr: "",
          stdout: "@0\tshell\t0\t1\n@8\tTab 4\t0\t0\n",
        };
      }

      return { error: undefined, status: 0, stderr: "", stdout: "" };
    }) as unknown as NonNullable<LocalHostDeps["spawnSync"]>;
    const client = new LocalWorkspaceHost({
      invoke: async () => "",
      spawnSync: spawnSyncMock,
    });

    const terminal = await client.createTerminal(workspace(), {
      sessionName: "lc-local-session",
      title: "Tab 4",
    });

    expect(terminal).toEqual({
      id: "@8",
      title: "Tab 4",
      kind: "custom",
      busy: false,
    });
  });

  test("local host client canonicalizes bare numeric created terminal ids", async () => {
    let listCalls = 0;
    const spawnSyncMock = ((program: string, args?: readonly string[]) => {
      const commandArgs = [...(args ?? [])];

      if (
        program === "sh" &&
        commandArgs[0] === "-lc" &&
        commandArgs[1]?.includes("command -v 'tmux'")
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      if (
        program === "sh" &&
        commandArgs[0] === "-lc" &&
        commandArgs[1]?.includes("'tmux' 'has-session'")
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      if (program === "tmux" && commandArgs[0] === "new-window") {
        return {
          error: undefined,
          status: 0,
          stderr: "",
          stdout: "0104\n",
        };
      }

      if (program === "tmux" && commandArgs[0] === "list-windows") {
        listCalls += 1;
        return {
          error: undefined,
          status: 0,
          stderr: "",
          stdout: listCalls === 1 ? "@0\tshell\t0\t1\n" : "@0\tshell\t0\t1\n@104\tTab 4\t0\t0\n",
        };
      }

      return { error: undefined, status: 0, stderr: "", stdout: "" };
    }) as unknown as NonNullable<LocalHostDeps["spawnSync"]>;
    const client = new LocalWorkspaceHost({
      invoke: async () => "",
      spawnSync: spawnSyncMock,
    });

    const terminal = await client.createTerminal(workspace(), {
      sessionName: "lc-local-session",
      title: "Tab 4",
    });

    expect(normalizeTmuxTerminalId("0104")).toBe("@104");
    expect(terminal).toEqual({
      id: "@104",
      title: "Tab 4",
      kind: "custom",
      busy: false,
    });
  });

  test("local host client launches the requested harness command when creating a terminal", async () => {
    const calls: Array<{ program: string; args: string[] }> = [];
    const spawnSyncMock = ((program: string, args?: readonly string[]) => {
      const commandArgs = [...(args ?? [])];
      calls.push({ program, args: commandArgs });

      if (
        program === "sh" &&
        commandArgs[0] === "-lc" &&
        commandArgs[1]?.includes("command -v 'tmux'")
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      if (
        program === "sh" &&
        commandArgs[0] === "-lc" &&
        commandArgs[1]?.includes("'tmux' 'has-session'")
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      if (program === "tmux" && commandArgs[0] === "new-window") {
        return {
          error: undefined,
          status: 0,
          stderr: "",
          stdout: "@8\n",
        };
      }

      if (program === "tmux" && commandArgs[0] === "list-windows") {
        return {
          error: undefined,
          status: 0,
          stderr: "",
          stdout: "@0\tshell\t0\t1\n@8\tCodex\t0\t0\n",
        };
      }

      return { error: undefined, status: 0, stderr: "", stdout: "" };
    }) as unknown as NonNullable<LocalHostDeps["spawnSync"]>;
    const client = new LocalWorkspaceHost({
      invoke: async () => "",
      spawnSync: spawnSyncMock,
    });

    const terminal = await client.createTerminal(workspace(), {
      sessionName: "lc-local-session",
      kind: "codex",
      title: "Codex",
      launchSpec: {
        program: "codex",
        args: ["--model", "gpt-5.4", "--search"],
        cwd: null,
        env: [],
      },
    });

    expect(terminal).toEqual({
      id: "@8",
      title: "Codex",
      kind: "codex",
      busy: false,
    });
    expect(
      calls.some(
        (call) =>
          call.program === "tmux" &&
          call.args[0] === "new-window" &&
          call.args.at(-1) === "'env' 'codex' '--model' 'gpt-5.4' '--search'",
      ),
    ).toBe(true);
  });

  test("local host client falls back to the terminal listing when create output is not parseable", async () => {
    let listCalls = 0;
    const spawnSyncMock = ((program: string, args?: readonly string[]) => {
      const commandArgs = [...(args ?? [])];

      if (
        program === "sh" &&
        commandArgs[0] === "-lc" &&
        commandArgs[1]?.includes("command -v 'tmux'")
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      if (
        program === "sh" &&
        commandArgs[0] === "-lc" &&
        commandArgs[1]?.includes("'tmux' 'has-session'")
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      if (program === "tmux" && commandArgs[0] === "new-window") {
        return {
          error: undefined,
          status: 0,
          stderr: "",
          stdout: "created\n",
        };
      }

      if (program === "tmux" && commandArgs[0] === "list-windows") {
        listCalls += 1;
        return {
          error: undefined,
          status: 0,
          stderr: "",
          stdout: listCalls === 1 ? "@0\tshell\t0\t1\n" : "@0\tshell\t0\t1\n@8\tTab 4\t0\t0\n",
        };
      }

      return { error: undefined, status: 0, stderr: "", stdout: "" };
    }) as unknown as NonNullable<LocalHostDeps["spawnSync"]>;
    const client = new LocalWorkspaceHost({
      invoke: async () => "",
      spawnSync: spawnSyncMock,
    });

    const terminal = await client.createTerminal(workspace(), {
      sessionName: "lc-local-session",
      title: "Tab 4",
    });

    expect(terminal).toEqual({
      id: "@8",
      title: "Tab 4",
      kind: "custom",
      busy: false,
    });
  });

  test("local host client retries resolving a freshly created terminal when tmux lags", async () => {
    let listCalls = 0;
    const spawnSyncMock = ((program: string, args?: readonly string[]) => {
      const commandArgs = [...(args ?? [])];

      if (
        program === "sh" &&
        commandArgs[0] === "-lc" &&
        commandArgs[1]?.includes("command -v 'tmux'")
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      if (
        program === "sh" &&
        commandArgs[0] === "-lc" &&
        commandArgs[1]?.includes("'tmux' 'has-session'")
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      if (program === "tmux" && commandArgs[0] === "new-window") {
        return {
          error: undefined,
          status: 0,
          stderr: "",
          stdout: "@8\n",
        };
      }

      if (program === "tmux" && commandArgs[0] === "list-windows") {
        listCalls += 1;
        return {
          error: undefined,
          status: 0,
          stderr: "",
          stdout: listCalls === 1 ? "@0\tshell\t0\t1\n" : "@0\tshell\t0\t1\n@8\tTab 4\t0\t0\n",
        };
      }

      return { error: undefined, status: 0, stderr: "", stdout: "" };
    }) as unknown as NonNullable<LocalHostDeps["spawnSync"]>;
    const client = new LocalWorkspaceHost({
      invoke: async () => "",
      spawnSync: spawnSyncMock,
    });

    const terminal = await client.createTerminal(workspace(), {
      sessionName: "lc-local-session",
      title: "Tab 4",
    });

    expect(listCalls).toBeGreaterThan(1);
    expect(terminal).toEqual({
      id: "@8",
      title: "Tab 4",
      kind: "custom",
      busy: false,
    });
  });

  test("local host client preserves the managed tmux profile while resolving a created terminal", async () => {
    const calls: Array<{ program: string; args: string[] }> = [];
    const spawnSyncMock = ((program: string, args?: readonly string[]) => {
      const commandArgs = [...(args ?? [])];
      calls.push({ program, args: commandArgs });

      if (
        program === "sh" &&
        commandArgs[0] === "-lc" &&
        commandArgs[1]?.includes("command -v '/usr/local/bin/tmux'")
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      if (
        program === "/usr/local/bin/tmux" &&
        commandArgs.slice(0, 5).join(" ") ===
          `-L ${MANAGED_TMUX_SOCKET_NAME} -f /dev/null has-session`
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      if (
        program === "/usr/local/bin/tmux" &&
        commandArgs.slice(0, 5).join(" ") ===
          `-L ${MANAGED_TMUX_SOCKET_NAME} -f /dev/null list-windows`
      ) {
        return {
          error: undefined,
          status: 0,
          stderr: "",
          stdout:
            calls.filter(
              (call) => call.program === "/usr/local/bin/tmux" && call.args[5] === "list-windows",
            ).length === 1
              ? "@0\tshell\t0\t1\n"
              : "@0\tshell\t0\t1\n@8\tTab 4\t0\t0\n",
        };
      }

      if (
        program === "/usr/local/bin/tmux" &&
        commandArgs.slice(0, 5).join(" ") ===
          `-L ${MANAGED_TMUX_SOCKET_NAME} -f /dev/null new-window`
      ) {
        return {
          error: undefined,
          status: 0,
          stderr: "",
          stdout: "@8\n",
        };
      }

      if (
        program === "sh" &&
        commandArgs[0] === "-lc" &&
        commandArgs[1]?.includes(`'/usr/local/bin/tmux' '-L' '${MANAGED_TMUX_SOCKET_NAME}'`)
      ) {
        return { error: undefined, status: 0, stderr: "", stdout: "" };
      }

      return { error: undefined, status: 0, stderr: "", stdout: "" };
    }) as unknown as NonNullable<LocalHostDeps["spawnSync"]>;
    const client = new LocalWorkspaceHost({
      invoke: async () => "",
      spawnSync: spawnSyncMock,
    });

    const terminal = await client.createTerminal(workspace(), {
      sessionName: "lc-local-session",
      title: "Tab 4",
      persistenceMode: "managed",
      persistenceExecutablePath: "/usr/local/bin/tmux",
    });

    expect(terminal).toEqual({
      id: "@8",
      title: "Tab 4",
      kind: "custom",
      busy: false,
    });
    expect(
      calls.some(
        (call) =>
          call.program === "/usr/local/bin/tmux" &&
          call.args.slice(0, 5).join(" ") ===
            `-L ${MANAGED_TMUX_SOCKET_NAME} -f /dev/null list-windows`,
      ),
    ).toBe(true);
  });

  test("cloud host client lists tmux-backed terminal records through remote execution", async () => {
    const calls: string[][] = [];
    const client = new CloudWorkspaceHost({
      execWorkspaceCommand: async (_workspaceId, command) => {
        calls.push(command);
        if (command[0] === "tmux" && command[1] === "list-windows") {
          return {
            exitCode: 0,
            stderr: "",
            stdout: "@1\tshell\t0\t1\n@3\tclaude\t1\t0\n",
          };
        }
        return {
          exitCode: 0,
          stderr: "",
          stdout: "",
        };
      },
      getShellConnection: async () => ({
        cwd: "/workspace/repo",
        home: "/home/lifecycle",
        host: "ssh.app.lifecycle.test",
        token: "tok_123",
      }),
    });

    const terminals = await client.listTerminals(workspace({ host: "cloud" }), {
      sessionName: "lc-cloud-session",
    });

    expect(terminals).toEqual([
      {
        id: "@1",
        title: "shell",
        kind: "shell",
        busy: false,
      },
      {
        id: "@3",
        title: "claude",
        kind: "claude",
        busy: true,
      },
    ]);
    expect(calls[0]?.slice(0, 2)).toEqual(["tmux", "has-session"]);
    expect(calls[1]?.slice(0, 2)).toEqual(["tmux", "list-windows"]);
  });

  test("cloud host client returns an ssh-backed spawn connection for a terminal", async () => {
    const client = new CloudWorkspaceHost({
      execWorkspaceCommand: async () => ({
        exitCode: 0,
        stderr: "",
        stdout: "",
      }),
      getShellConnection: async () => ({
        cwd: "/workspace/repo",
        home: "/home/lifecycle",
        host: "ssh.app.lifecycle.test",
        token: "tok_123",
      }),
    });

    const connection = await client.connectTerminal(workspace({ host: "cloud" }), {
      sessionName: "lc-cloud-session",
      terminalId: "@4",
      clientId: "surface-B",
      access: "interactive",
      preferredTransport: "spawn",
    });

    expect(connection.launchError).toBeNull();
    expect(connection.connectionId).toBe("lc-cloud-session--conn--surface-B--_4");
    expect(connection.transport?.kind).toBe("spawn");
    if (!connection.transport || connection.transport.kind !== "spawn") {
      throw new Error("Expected a spawn transport for the cloud terminal connection.");
    }
    expect(connection.transport.prepare?.program).toBe("ssh");
    expect(connection.transport.prepare?.args.at(-1)).toContain(
      "lc-cloud-session--conn--surface-B--_4",
    );
    expect(connection.transport.spec?.program).toBe("ssh");
    expect(connection.transport.spec?.args.at(-1)).toContain("attach-session");
    expect(connection.transport.spec?.args.at(-1)).toContain(
      "lc-cloud-session--conn--surface-B--_4",
    );
  });

  test("cloud host client uses the managed tmux profile for remote terminal commands", async () => {
    const calls: string[][] = [];
    const client = new CloudWorkspaceHost({
      execWorkspaceCommand: async (_workspaceId, command) => {
        calls.push(command);
        if (command[0] === "/usr/local/bin/tmux" && command[5] === "list-windows") {
          return {
            exitCode: 0,
            stderr: "",
            stdout: "@1\tshell\t0\t1\n",
          };
        }
        return {
          exitCode: 0,
          stderr: "",
          stdout: "",
        };
      },
      getShellConnection: async () => ({
        cwd: "/workspace/repo",
        home: "/home/lifecycle",
        host: "ssh.app.lifecycle.test",
        token: "tok_123",
      }),
    });

    const terminals = await client.listTerminals(workspace({ host: "cloud" }), {
      sessionName: "lc-cloud-session",
      persistenceMode: "managed",
      persistenceExecutablePath: "/usr/local/bin/tmux",
    });

    expect(terminals).toEqual([
      {
        id: "@1",
        title: "shell",
        kind: "shell",
        busy: false,
      },
    ]);
    expect(calls[1]?.slice(0, 5)).toEqual([
      "/usr/local/bin/tmux",
      "-L",
      MANAGED_TMUX_SOCKET_NAME,
      "-f",
      "/dev/null",
    ]);
  });

  test("local host client reads lifecycle manifests through the injected file reader", async () => {
    const client = new LocalWorkspaceHost({
      invoke: async () => "",
      fileReader: {
        exists: async () => true,
        readTextFile: async () =>
          '{"workspace":{"prepare":[]},"stack":{"nodes":{"web":{"kind":"process","command":"bun run dev"}}}}',
      },
    });

    const result = await client.readManifest("/tmp/project_1");
    expect(result.state).toBe("valid");
  });

  test("local host client routes root git branch lookup through the git capability", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = new LocalWorkspaceHost({
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        calls.push(args ? { cmd, args } : { cmd });
        return "feature/provider-boundary";
      },
    });

    expect(await client.getGitCurrentBranch("/tmp/project_1")).toBe("feature/provider-boundary");
    expect(calls).toEqual([
      {
        cmd: "get_git_current_branch",
        args: { repoPath: "/tmp/project_1" },
      },
    ]);
  });

  test("local host client creates worktrees with the native branch arg", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const target = workspace({
      checkout_type: "worktree",
      source_ref: "lifecycle/blaze-beacon",
      workspace_root: null,
    });
    const client = new LocalWorkspaceHost({
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        calls.push(args ? { cmd, args } : { cmd });

        switch (cmd) {
          case "create_git_worktree":
            return "/tmp/project_1/.worktrees/ws_1";
          case "get_git_sha":
            return "abc123";
          default:
            return undefined;
        }
      },
    });

    const result = await client.ensureWorkspace({
      workspace: target,
      projectPath: "/tmp/project_1",
      baseRef: "main",
      worktreeRoot: "/tmp/project_1/.worktrees",
      manifestFingerprint: "manifest_next",
    });

    expect(calls).toEqual([
      {
        cmd: "create_git_worktree",
        args: {
          repoPath: "/tmp/project_1",
          baseRef: "main",
          branch: "lifecycle/blaze-beacon",
          name: "Workspace 1",
          id: "ws_1",
          worktreeRoot: "/tmp/project_1/.worktrees",
          copyConfigFiles: true,
        },
      },
      {
        cmd: "get_git_sha",
        args: {
          repoPath: "/tmp/project_1",
          refName: "lifecycle/blaze-beacon",
        },
      },
    ]);

    expect(result.workspace_root).toBe("/tmp/project_1/.worktrees/ws_1");
    expect(result.git_sha).toBe("abc123");
    expect(result.manifest_fingerprint).toBe("manifest_next");
    expect(result.status).toBe("active");
  });

  test("local host client routes open-in actions through generic commands", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const client = new LocalWorkspaceHost({
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        calls.push(args ? { cmd, args } : { cmd });
        if (cmd === "list_open_in_apps") {
          return [{ icon_data_url: null, id: "vscode", label: "VS Code" }];
        }
        return undefined;
      },
    });

    await client.openInApp(workspace(), "vscode");
    expect(await client.listOpenInApps()).toEqual([
      { iconDataUrl: null, id: "vscode", label: "VS Code" },
    ]);
    expect(calls).toEqual([
      {
        cmd: "open_in_app",
        args: { rootPath: REPO_PATH, appId: "vscode" },
      },
      { cmd: "list_open_in_apps" },
    ]);
  });

  test("resolves host clients by host", () => {
    const localClient = { name: "local" } as never;
    const cloudClient = { name: "cloud" } as never;
    const dockerClient = { name: "docker" } as never;
    const remoteClient = { name: "remote" } as never;
    const registry = createWorkspaceHostRegistry({
      cloud: cloudClient,
      docker: dockerClient,
      local: localClient,
      remote: remoteClient,
    });

    expect(registry.resolve("local")).toBe(localClient);
    expect(registry.resolve("cloud")).toBe(cloudClient);
    expect(registry.resolve("docker")).toBe(dockerClient);
    expect(registry.resolve("remote")).toBe(remoteClient);
    expect(() => createWorkspaceHostRegistry({ local: localClient }).resolve("cloud")).toThrow(
      'No WorkspaceHostAdapter is registered for workspace host "cloud".',
    );
  });

  test("host client forwards file operations with root path", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const fileResult = {
      absolute_path: "/tmp/project_1/.worktrees/ws_1/README.md",
      byte_len: 7,
      content: "welcome",
      extension: "md",
      file_path: "README.md",
      is_binary: false,
      is_too_large: false,
    } as const;
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });

      switch (cmd) {
        case "read_file":
        case "write_file":
          return fileResult;
        case "list_files":
          return [{ extension: "md", file_path: "README.md" }];
        default:
          return undefined;
      }
    };
    const client = new LocalWorkspaceHost({ invoke });
    const target = workspace();

    await client.readFile(target, "README.md");
    await client.writeFile(target, "README.md", "welcome");
    await client.listFiles(target);
    await client.openFile(target, "README.md");

    expect(calls).toEqual([
      { cmd: "read_file", args: { rootPath: REPO_PATH, filePath: "README.md" } },
      {
        cmd: "write_file",
        args: { rootPath: REPO_PATH, filePath: "README.md", content: "welcome" },
      },
      { cmd: "list_files", args: { rootPath: REPO_PATH } },
      { cmd: "open_file", args: { rootPath: REPO_PATH, filePath: "README.md" } },
    ]);
  });

  test("host client forwards git operations with repo path", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const invoke = async (cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ? { cmd, args } : { cmd });

      switch (cmd) {
        case "get_git_status":
          return {
            branch: "feature/vc",
            headSha: "abc123",
            upstream: "origin/feature/vc",
            ahead: 1,
            behind: 0,
            files: [],
          };
        case "get_git_scope_patch":
        case "get_git_changes_patch":
        case "get_git_ref_diff_patch":
        case "get_git_pull_request_patch":
          return "";
        case "get_git_diff":
          return { scope: "working", filePath: "src/app.ts", patch: "", isBinary: false };
        case "list_git_log":
          return [];
        case "list_git_pull_requests":
          return {
            support: { available: true, message: null, provider: "github", reason: null },
            pullRequests: [],
          };
        case "get_git_pull_request":
          return {
            support: { available: true, message: null, provider: "github", reason: null },
            pullRequest: null,
          };
        case "get_current_git_pull_request":
          return {
            support: { available: true, message: null, provider: "github", reason: null },
            branch: "feature/vc",
            hasPullRequestChanges: true,
            upstream: "origin/feature/vc",
            suggestedBaseRef: "main",
            pullRequest: null,
          };
        case "get_git_base_ref":
          return "main";
        case "get_git_commit_patch":
          return { sha: String(args?.sha ?? ""), patch: "" };
        case "commit_git":
          return { sha: "abc123", shortSha: "abc123", message: String(args?.message ?? "") };
        case "push_git":
          return { branch: "feature/vc", remote: "origin", ahead: 0, behind: 0 };
        case "create_git_pull_request":
          return {
            author: "kyle",
            baseRefName: "main",
            createdAt: "",
            headRefName: "feature/vc",
            isDraft: false,
            mergeStateStatus: "CLEAN",
            mergeable: "mergeable",
            number: 42,
            reviewDecision: "approved",
            checks: null,
            state: "open",
            title: "feat",
            updatedAt: "",
            url: "",
          };
        case "merge_git_pull_request":
          return {
            author: "kyle",
            baseRefName: "main",
            createdAt: "",
            headRefName: "feature/vc",
            isDraft: false,
            mergeStateStatus: "CLEAN",
            mergeable: "mergeable",
            number: 42,
            reviewDecision: "approved",
            checks: null,
            state: "merged",
            title: "feat",
            updatedAt: "",
            url: "",
          };
        default:
          return undefined;
      }
    };
    const client = new LocalWorkspaceHost({ invoke });
    const target = workspace();

    await client.getGitStatus(target);
    await client.getGitScopePatch(target, "working");
    await client.getGitChangesPatch(target);
    await client.getGitDiff({ workspace: target, filePath: "src/app.ts", scope: "working" });
    await client.listGitLog(target, 25);
    await client.listGitPullRequests(target);
    await client.getGitPullRequest(target, 42);
    await client.getCurrentGitPullRequest(target);
    await client.getGitBaseRef(target);
    await client.getGitRefDiffPatch(target, "main", "HEAD");
    await client.getGitPullRequestPatch(target, 42);
    await client.getGitCommitPatch(target, "abc123");
    await client.stageGitFiles(target, ["src/app.ts"]);
    await client.unstageGitFiles(target, ["src/app.ts"]);
    await client.commitGit(target, "feat: add version control");
    await client.pushGit(target);
    await client.createGitPullRequest(target);
    await client.mergeGitPullRequest(target, 42);

    expect(calls).toEqual([
      { cmd: "get_git_status", args: { repoPath: REPO_PATH } },
      { cmd: "get_git_scope_patch", args: { repoPath: REPO_PATH, scope: "working" } },
      { cmd: "get_git_changes_patch", args: { repoPath: REPO_PATH } },
      {
        cmd: "get_git_diff",
        args: { repoPath: REPO_PATH, filePath: "src/app.ts", scope: "working" },
      },
      { cmd: "list_git_log", args: { repoPath: REPO_PATH, limit: 25 } },
      { cmd: "list_git_pull_requests", args: { repoPath: REPO_PATH } },
      { cmd: "get_git_pull_request", args: { repoPath: REPO_PATH, pullRequestNumber: 42 } },
      { cmd: "get_current_git_pull_request", args: { repoPath: REPO_PATH } },
      { cmd: "get_git_base_ref", args: { repoPath: REPO_PATH } },
      {
        cmd: "get_git_ref_diff_patch",
        args: { repoPath: REPO_PATH, baseRef: "main", headRef: "HEAD" },
      },
      { cmd: "get_git_pull_request_patch", args: { repoPath: REPO_PATH, pullRequestNumber: 42 } },
      { cmd: "get_git_commit_patch", args: { repoPath: REPO_PATH, sha: "abc123" } },
      { cmd: "stage_git_files", args: { repoPath: REPO_PATH, filePaths: ["src/app.ts"] } },
      { cmd: "unstage_git_files", args: { repoPath: REPO_PATH, filePaths: ["src/app.ts"] } },
      { cmd: "commit_git", args: { repoPath: REPO_PATH, message: "feat: add version control" } },
      { cmd: "push_git", args: { repoPath: REPO_PATH } },
      { cmd: "create_git_pull_request", args: { repoPath: REPO_PATH } },
      { cmd: "merge_git_pull_request", args: { repoPath: REPO_PATH, pullRequestNumber: 42 } },
    ]);
  });
});
