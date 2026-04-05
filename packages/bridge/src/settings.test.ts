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
      appearance: { theme: "monokai" },
      terminal: {
        command: { program: null },
        persistence: {
          backend: "tmux",
          mode: "inherit",
          executablePath: "/opt/homebrew/bin/tmux",
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
        appearance: { theme: "rose-pine" },
      },
      {
        HOME: root,
        LIFECYCLE_ROOT: root,
      },
    );

    expect(result.settings.appearance.theme).toBe("rose-pine");

    const persisted = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
    expect(persisted.customUserField).toBe(42);
    expect(persisted.theme).toBeUndefined();
    expect(persisted.appearance).toEqual({ theme: "rose-pine" });
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
});
