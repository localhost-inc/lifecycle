import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { checkHookTarget, installHookTarget, resolveHookTargets } from "./hooks";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { force: true, recursive: true });
    }
  }
});

describe("repo hook installer", () => {
  test("merges project-scoped hook config without deleting unrelated settings", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-cli-hooks-"));
    tempDirs.push(dir);

    await mkdir(join(dir, ".claude"), { recursive: true });
    await writeFile(
      join(dir, ".claude", "settings.json"),
      `${JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                hooks: [
                  {
                    command: "echo keep-me",
                    type: "command",
                  },
                ],
                matcher: "Bash",
              },
            ],
          },
          permissions: {
            allow: ["Read"],
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await mkdir(join(dir, ".codex"), { recursive: true });
    await writeFile(
      join(dir, ".codex", "config.toml"),
      ['model = "gpt-5"', "", "[features]", 'theme = "light"', ""].join("\n"),
      "utf8",
    );
    await writeFile(
      join(dir, ".codex", "hooks.json"),
      `${JSON.stringify(
        {
          hooks: {
            Stop: [
              {
                hooks: [
                  {
                    command:
                      'sh "$(git rev-parse --show-toplevel)/.lifecycle/hooks/activity.sh" turn.completed --provider codex --old-flag',
                    type: "command",
                  },
                ],
              },
            ],
          },
          version: 1,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const targets = resolveHookTargets(dir);

    expect(targets.map((target) => installHookTarget(target))).toEqual([
      "created",
      "updated",
      "updated",
      "updated",
      "created",
    ]);

    const adapter = await readFile(join(dir, ".lifecycle", "hooks", "activity.sh"), "utf8");
    expect(adapter).toContain("LIFECYCLE_WORKSPACE_ID");
    expect(adapter).toContain("tmux display-message");
    expect(adapter).toContain("--terminal-id");
    expect(adapter).toContain("workspace activity emit");
    expect(adapter).not.toContain("--read-hook-input");

    const claudeConfig = JSON.parse(
      await readFile(join(dir, ".claude", "settings.json"), "utf8"),
    ) as {
      hooks: Record<string, Array<{ hooks: Array<Record<string, unknown>>; matcher?: string }>>;
      permissions: Record<string, unknown>;
    };
    expect(claudeConfig.permissions).toEqual({
      allow: ["Read"],
    });
    expect(claudeConfig.hooks.PreToolUse?.[0]?.hooks).toEqual([
      {
        command: "echo keep-me",
        type: "command",
      },
      {
        command:
          'sh "${CLAUDE_PROJECT_DIR}/.lifecycle/hooks/activity.sh" tool_call.started --provider claude-code --name Bash',
        type: "command",
      },
    ]);
    expect(claudeConfig.hooks.UserPromptSubmit?.[0]?.hooks[0]).toEqual({
      command:
        'sh "${CLAUDE_PROJECT_DIR}/.lifecycle/hooks/activity.sh" turn.started --provider claude-code',
      type: "command",
    });

    const codexConfig = await readFile(join(dir, ".codex", "config.toml"), "utf8");
    expect(codexConfig).toContain('model = "gpt-5"');
    expect(codexConfig).toContain('theme = "light"');
    expect(codexConfig).toContain("codex_hooks = true");

    const codexHooks = JSON.parse(await readFile(join(dir, ".codex", "hooks.json"), "utf8")) as {
      hooks: Record<string, Array<{ hooks: Array<Record<string, unknown>> }>>;
      version: number;
    };
    expect(codexHooks.version).toBe(1);
    expect(codexHooks.hooks.Stop?.[0]?.hooks[0]).toEqual({
      command:
        'sh "$(git rev-parse --show-toplevel)/.lifecycle/hooks/activity.sh" turn.completed --provider codex',
      type: "command",
    });
    expect(codexHooks.hooks.PreToolUse?.[0]?.hooks[0]).toEqual({
      command:
        'sh "$(git rev-parse --show-toplevel)/.lifecycle/hooks/activity.sh" tool_call.started --provider codex --name Bash',
      type: "command",
    });

    const opencodePlugin = await readFile(
      join(dir, ".opencode", "plugins", "lifecycle-activity.js"),
      "utf8",
    );
    expect(opencodePlugin).toContain("workspace");
    expect(opencodePlugin).toContain("activity");
    expect(opencodePlugin).toContain("opencode");
    expect(opencodePlugin).toContain('"session.status"');
    expect(opencodePlugin).toContain('"session.idle"');
    expect(opencodePlugin).toContain('"tool.execute.before"');
    expect(opencodePlugin).toContain('"tool.execute.after"');
    expect(opencodePlugin).not.toContain("session.prompt");

    const adapterAfterFirstInstall = await readFile(
      join(dir, ".lifecycle", "hooks", "activity.sh"),
      "utf8",
    );
    const claudeAfterFirstInstall = await readFile(join(dir, ".claude", "settings.json"), "utf8");
    const codexConfigAfterFirstInstall = await readFile(join(dir, ".codex", "config.toml"), "utf8");
    const codexHooksAfterFirstInstall = await readFile(join(dir, ".codex", "hooks.json"), "utf8");
    const opencodeAfterFirstInstall = await readFile(
      join(dir, ".opencode", "plugins", "lifecycle-activity.js"),
      "utf8",
    );

    expect(targets.map((target) => installHookTarget(target))).toEqual([
      "unchanged",
      "unchanged",
      "unchanged",
      "unchanged",
      "unchanged",
    ]);
    expect(await readFile(join(dir, ".lifecycle", "hooks", "activity.sh"), "utf8")).toBe(
      adapterAfterFirstInstall,
    );
    expect(await readFile(join(dir, ".claude", "settings.json"), "utf8")).toBe(
      claudeAfterFirstInstall,
    );
    expect(await readFile(join(dir, ".codex", "config.toml"), "utf8")).toBe(
      codexConfigAfterFirstInstall,
    );
    expect(await readFile(join(dir, ".codex", "hooks.json"), "utf8")).toBe(
      codexHooksAfterFirstInstall,
    );
    expect(await readFile(join(dir, ".opencode", "plugins", "lifecycle-activity.js"), "utf8")).toBe(
      opencodeAfterFirstInstall,
    );
  });

  test("reports missing, outdated, and installed hook state without writing files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-cli-hooks-check-"));
    tempDirs.push(dir);

    const targets = resolveHookTargets(dir);
    expect(targets.map((target) => checkHookTarget(target))).toEqual([
      "missing",
      "missing",
      "missing",
      "missing",
      "missing",
    ]);

    await mkdir(join(dir, ".lifecycle", "hooks"), { recursive: true });
    await writeFile(join(dir, ".lifecycle", "hooks", "activity.sh"), "#!/bin/sh\nexit 0\n", "utf8");
    await mkdir(join(dir, ".claude"), { recursive: true });
    await writeFile(
      join(dir, ".claude", "settings.json"),
      `${JSON.stringify(
        {
          hooks: {
            Stop: [
              {
                hooks: [
                  {
                    command:
                      'sh "${CLAUDE_PROJECT_DIR}/.lifecycle/hooks/activity.sh" turn.completed --provider claude-code --old-flag',
                    type: "command",
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await mkdir(join(dir, ".codex"), { recursive: true });
    await writeFile(
      join(dir, ".codex", "config.toml"),
      ["[features]", "codex_hooks = true", ""].join("\n"),
      "utf8",
    );
    await writeFile(
      join(dir, ".codex", "hooks.json"),
      `${JSON.stringify(
        {
          hooks: {
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    command:
                      'sh "$(git rev-parse --show-toplevel)/.lifecycle/hooks/activity.sh" turn.started --provider codex',
                    type: "command",
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    expect(targets.map((target) => checkHookTarget(target))).toEqual([
      "outdated",
      "outdated",
      "installed",
      "outdated",
      "missing",
    ]);
  });
});
