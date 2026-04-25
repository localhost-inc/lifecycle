import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LifecycleSettingsSchema } from "@lifecycle/contracts";
import { ZodError } from "zod";

import { readBridgeSettings, updateBridgeSettings } from "./service";

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
  test("reads defaulted canonical settings when settings file is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "lifecycle-settings-"));
    tempDirs.push(root);

    const result = await readBridgeSettings({
      HOME: root,
      LIFECYCLE_ROOT: root,
    });

    expect(result.settings_path).toBe(join(root, "settings.json"));
    expect(result.settings).toEqual(LifecycleSettingsSchema.parse({}));
  });

  test("updates nested appearance settings in the canonical shape", async () => {
    const root = await mkdtemp(join(tmpdir(), "lifecycle-settings-"));
    tempDirs.push(root);
    const settingsPath = join(root, "settings.json");

    await writeFile(
      settingsPath,
      JSON.stringify({
        appearance: {
          theme: "dark",
          fonts: {
            ui: "Geist",
            code: "Geist Mono",
          },
          dimInactivePanes: true,
          inactivePaneOpacity: 0.52,
        },
      }),
      "utf8",
    );

    const result = await updateBridgeSettings(
      {
        appearance: {
          theme: "rose-pine",
          fonts: {
            code: "JetBrains Mono",
          },
          dimInactivePanes: false,
          inactivePaneOpacity: 0.41,
        },
      },
      {
        HOME: root,
        LIFECYCLE_ROOT: root,
      },
    );

    expect(result.settings.appearance).toEqual({
      theme: "rose-pine",
      fonts: {
        ui: "Geist",
        code: "JetBrains Mono",
      },
      dimInactivePanes: false,
      inactivePaneOpacity: 0.41,
    });

    const persisted = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
    expect(persisted.appearance).toEqual({
      theme: "rose-pine",
      fonts: {
        ui: "Geist",
        code: "JetBrains Mono",
      },
      dimInactivePanes: false,
      inactivePaneOpacity: 0.41,
    });
  });

  test("updates provider auth settings in the canonical shape", async () => {
    const root = await mkdtemp(join(tmpdir(), "lifecycle-settings-"));
    tempDirs.push(root);
    const settingsPath = join(root, "settings.json");

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
    expect(persisted.providers).toEqual({
      claude: {
        loginMethod: "console",
      },
    });
  });

  test("updates terminal persistence settings in the canonical shape", async () => {
    const root = await mkdtemp(join(tmpdir(), "lifecycle-settings-"));
    tempDirs.push(root);
    const settingsPath = join(root, "settings.json");

    await writeFile(
      settingsPath,
      JSON.stringify({
        terminal: {
          command: { program: "/bin/zsh" },
          persistence: {
            backend: "tmux",
            mode: "inherit",
            executablePath: "/opt/homebrew/bin/tmux",
          },
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

    expect(result.settings.terminal.command).toEqual({ program: "/bin/zsh" });
    expect(result.settings.terminal.persistence).toEqual({
      backend: "tmux",
      mode: "managed",
      executablePath: null,
    });

    const persisted = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
    const terminal = persisted.terminal as Record<string, unknown>;
    expect(terminal.command).toEqual({ program: "/bin/zsh" });
    expect(terminal.persistence).toEqual({
      backend: "tmux",
      mode: "managed",
      executablePath: null,
    });
  });

  test("persists terminal launch profiles in the canonical shape", async () => {
    const root = await mkdtemp(join(tmpdir(), "lifecycle-settings-"));
    tempDirs.push(root);
    const settingsPath = join(root, "settings.json");

    await writeFile(
      settingsPath,
      JSON.stringify({
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
    expect(result.settings.terminal.profiles.claude).toEqual({
      launcher: "claude",
      label: "Claude Review",
      settings: {
        model: "claude-sonnet-4-6",
        permissionMode: "plan",
        effort: "high",
      },
    });
    expect(result.settings.terminal.profiles.codex).toEqual({
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
    });
    expect(result.settings.terminal.profiles.dev).toEqual({
      launcher: "command",
      label: "Dev Server",
      command: {
        program: "npm",
        args: ["run", "dev"],
        env: {
          PORT: "3000",
        },
      },
    });

    const persisted = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
    const terminal = persisted.terminal as Record<string, unknown>;
    expect(terminal.defaultProfile).toBe("dev");
    expect(terminal.profiles).toEqual(result.settings.terminal.profiles);
  });

  test("rejects presentation icons in terminal profile settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "lifecycle-settings-"));
    tempDirs.push(root);

    const result = updateBridgeSettings(
      {
        terminal: {
          profiles: {
            codex: {
              launcher: "codex",
              label: "Codex",
              icon: "asset:provider-openai",
            },
          },
        },
      } as never,
      {
        HOME: root,
        LIFECYCLE_ROOT: root,
      },
    );

    await expect(result).rejects.toBeInstanceOf(ZodError);
    await expect(result).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          code: "unrecognized_keys",
          keys: ["icon"],
          path: ["terminal", "profiles", "codex"],
        }),
      ],
    });
  });

  test("rejects settings files outside the canonical schema", async () => {
    const root = await mkdtemp(join(tmpdir(), "lifecycle-settings-"));
    tempDirs.push(root);

    await writeFile(
      join(root, "settings.json"),
      JSON.stringify({
        theme: "dark",
      }),
      "utf8",
    );

    await expect(
      readBridgeSettings({
        HOME: root,
        LIFECYCLE_ROOT: root,
      }),
    ).rejects.toThrow();
  });
});
