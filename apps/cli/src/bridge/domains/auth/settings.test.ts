import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { readBridgeSettings, updateBridgeSettings } from "./settings";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("bridge settings", () => {
  test("reads normalized settings from the lifecycle settings file", async () => {
    const root = await mkdtemp(join(tmpdir(), "lifecycle-settings-"));
    tempDirs.push(root);

    await writeFile(
      join(root, "settings.json"),
      JSON.stringify({
        appearance: { theme: "monokai" },
        terminal: {
          tmux: { mode: "inherit", program: "/opt/homebrew/bin/tmux" },
        },
      }),
      "utf8",
    );

    const result = await readBridgeSettings({
      HOME: root,
      LIFECYCLE_ROOT: root,
    });

    expect(result.settings_path).toBe(join(root, "settings.json"));
    expect(result.settings).toEqual({
      appearance: {
        theme: "monokai",
        dimInactivePanes: true,
        inactivePaneOpacity: 0.52,
      },
      providers: {
        claude: {
          loginMethod: "claudeai",
        },
      },
      terminal: {
        command: { program: null },
        persistence: {
          backend: "tmux",
          mode: "inherit",
          executablePath: "/opt/homebrew/bin/tmux",
        },
        defaultProfile: "shell",
        profiles: {
          shell: {
            launcher: "shell",
            label: "Shell",
          },
          claude: {
            launcher: "claude",
            label: "Claude",
            settings: {
              model: null,
              permissionMode: null,
              effort: null,
            },
          },
          codex: {
            launcher: "codex",
            label: "Codex",
            settings: {
              model: null,
              configProfile: null,
              approvalPolicy: null,
              sandboxMode: null,
              reasoningEffort: null,
              webSearch: null,
            },
          },
        },
      },
    });
  });

  test("updates nested settings while preserving unknown fields and migrating legacy theme", async () => {
    const root = await mkdtemp(join(tmpdir(), "lifecycle-settings-"));
    tempDirs.push(root);
    const settingsPath = join(root, "settings.json");

    await writeFile(
      settingsPath,
      JSON.stringify({
        theme: "dark",
        customUserField: 42,
      }),
      "utf8",
    );

    const result = await updateBridgeSettings(
      {
        appearance: {
          theme: "rose-pine",
          dimInactivePanes: false,
          inactivePaneOpacity: 0.41,
        },
      },
      {
        HOME: root,
        LIFECYCLE_ROOT: root,
      },
    );

    expect(result.settings.appearance.theme).toBe("rose-pine");
    expect(result.settings.appearance.dimInactivePanes).toBe(false);
    expect(result.settings.appearance.inactivePaneOpacity).toBe(0.41);

    const persisted = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
    expect(persisted.customUserField).toBe(42);
    expect(persisted.theme).toBeUndefined();
    expect(persisted.appearance).toEqual({
      theme: "rose-pine",
      dimInactivePanes: false,
      inactivePaneOpacity: 0.41,
    });
  });

  test("updates provider auth settings while preserving unknown fields", async () => {
    const root = await mkdtemp(join(tmpdir(), "lifecycle-settings-"));
    tempDirs.push(root);
    const settingsPath = join(root, "settings.json");

    await writeFile(
      settingsPath,
      JSON.stringify({
        customUserField: 42,
      }),
      "utf8",
    );

    const result = await updateBridgeSettings(
      {
        providers: {
          claude: {
            loginMethod: "console",
          },
        },
      },
      {
        HOME: root,
        LIFECYCLE_ROOT: root,
      },
    );

    expect(result.settings.providers).toEqual({
      claude: {
        loginMethod: "console",
      },
    });

    const persisted = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
    expect(persisted.customUserField).toBe(42);
    expect(persisted.providers).toEqual({
      claude: {
        loginMethod: "console",
      },
    });
  });

  test("writes the new terminal persistence shape while tolerating the legacy tmux shape", async () => {
    const root = await mkdtemp(join(tmpdir(), "lifecycle-settings-"));
    tempDirs.push(root);
    const settingsPath = join(root, "settings.json");

    await writeFile(
      settingsPath,
      JSON.stringify({
        terminal: {
          shell: { program: "/bin/zsh" },
          tmux: { mode: "inherit", program: "/opt/homebrew/bin/tmux" },
        },
      }),
      "utf8",
    );

    const result = await updateBridgeSettings(
      {
        terminal: {
          persistence: {
            backend: "tmux",
            mode: "managed",
            executablePath: null,
          },
        },
      },
      {
        HOME: root,
        LIFECYCLE_ROOT: root,
      },
    );

    expect(result.settings.terminal).toEqual({
      command: { program: "/bin/zsh" },
      persistence: {
        backend: "tmux",
        mode: "managed",
        executablePath: null,
      },
      defaultProfile: "shell",
      profiles: {
        shell: {
          launcher: "shell",
          label: "Shell",
        },
        claude: {
          launcher: "claude",
          label: "Claude",
          settings: {
            model: null,
            permissionMode: null,
            effort: null,
          },
        },
        codex: {
          launcher: "codex",
          label: "Codex",
          settings: {
            model: null,
            configProfile: null,
            approvalPolicy: null,
            sandboxMode: null,
            reasoningEffort: null,
            webSearch: null,
          },
        },
      },
    });
    expect(result.settings.providers).toEqual({
      claude: {
        loginMethod: "claudeai",
      },
    });

    const persisted = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
    const terminal = persisted.terminal as Record<string, unknown>;
    expect(terminal.shell).toBeUndefined();
    expect(terminal.tmux).toBeUndefined();
    expect(terminal.command).toEqual({ program: "/bin/zsh" });
    expect(terminal.persistence).toEqual({
      backend: "tmux",
      mode: "managed",
    });
  });

  test("persists terminal launch profiles while preserving unknown fields", async () => {
    const root = await mkdtemp(join(tmpdir(), "lifecycle-settings-"));
    tempDirs.push(root);
    const settingsPath = join(root, "settings.json");

    await writeFile(
      settingsPath,
      JSON.stringify({
        customUserField: 42,
        terminal: {
          profiles: {
            dev: {
              launcher: "command",
              label: "Dev Server",
              command: {
                program: "npm",
                args: ["run", "dev"],
                env: {
                  PORT: "3000",
                },
              },
            },
          },
        },
      }),
      "utf8",
    );

    const result = await updateBridgeSettings(
      {
        terminal: {
          defaultProfile: "dev",
          profiles: {
            claude: {
              launcher: "claude",
              label: "Claude Review",
              settings: {
                model: "claude-sonnet-4-6",
                permissionMode: "plan",
                effort: "high",
              },
            },
            codex: {
              launcher: "codex",
              label: "Codex Fast",
              settings: {
                configProfile: "fast",
                model: "gpt-5.4",
                approvalPolicy: "on-request",
                sandboxMode: "workspace-write",
                reasoningEffort: "high",
                webSearch: "live",
              },
            },
          },
        },
      },
      {
        HOME: root,
        LIFECYCLE_ROOT: root,
      },
    );

    expect(result.settings.terminal.defaultProfile).toBe("dev");
    expect(result.settings.terminal.profiles).toEqual({
      shell: {
        launcher: "shell",
        label: "Shell",
      },
      claude: {
        launcher: "claude",
        label: "Claude Review",
        settings: {
          model: "claude-sonnet-4-6",
          permissionMode: "plan",
          effort: "high",
        },
      },
      codex: {
        launcher: "codex",
        label: "Codex Fast",
        settings: {
          model: "gpt-5.4",
          configProfile: "fast",
          approvalPolicy: "on-request",
          sandboxMode: "workspace-write",
          reasoningEffort: "high",
          webSearch: "live",
        },
      },
      dev: {
        launcher: "command",
        label: "Dev Server",
        command: {
          program: "npm",
          args: ["run", "dev"],
          env: {
            PORT: "3000",
          },
        },
      },
    });

    const persisted = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
    const terminal = persisted.terminal as Record<string, unknown>;
    const profiles = terminal.profiles as Record<string, unknown>;

    expect(persisted.customUserField).toBe(42);
    expect(terminal.defaultProfile).toBe("dev");
    expect(profiles).toEqual({
      shell: {
        launcher: "shell",
        label: "Shell",
      },
      dev: {
        launcher: "command",
        label: "Dev Server",
        command: {
          program: "npm",
          args: ["run", "dev"],
          env: {
            PORT: "3000",
          },
        },
      },
      claude: {
        launcher: "claude",
        label: "Claude Review",
        settings: {
          model: "claude-sonnet-4-6",
          permissionMode: "plan",
          effort: "high",
        },
      },
      codex: {
        launcher: "codex",
        label: "Codex Fast",
        settings: {
          configProfile: "fast",
          model: "gpt-5.4",
          approvalPolicy: "on-request",
          sandboxMode: "workspace-write",
          reasoningEffort: "high",
          webSearch: "live",
        },
      },
    });
  });
});
