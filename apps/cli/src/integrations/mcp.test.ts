import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { checkMcpTarget, installMcpTarget, resolveMcpTargets } from "./mcp";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { force: true, recursive: true });
    }
  }
});

describe("repo MCP installer", () => {
  test("merges project-scoped JSON and TOML configs without deleting unrelated config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-cli-mcp-"));
    tempDirs.push(dir);

    await writeFile(
      join(dir, ".mcp.json"),
      `${JSON.stringify(
        {
          mcpServers: {
            lifecycle: {
              command: "old-lifecycle",
              enabled: true,
              args: ["old"],
            },
            other: {
              args: ["serve"],
              command: "other-tool",
            },
          },
          version: 1,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await mkdir(join(dir, ".codex"), { recursive: true });
    await writeFile(
      join(dir, ".codex", "config.toml"),
      [
        'model = "gpt-5"',
        "",
        "[mcp_servers.lifecycle]",
        "# keep this comment",
        'notes = "keep me"',
        'command = "old-lifecycle"',
        'args = ["old"]',
        "",
        "[mcp_servers.other]",
        'command = "other-tool"',
        'args = ["serve"]',
        "",
      ].join("\n"),
      "utf8",
    );

    const targets = resolveMcpTargets("project", dir);
    const entry = { args: ["mcp"], command: "lifecycle" };

    expect(targets.map((target) => target.harness_id)).toEqual(["claude-code", "codex"]);
    expect(targets.map((target) => installMcpTarget(target, entry))).toEqual(["updated", "updated"]);

    const jsonConfig = JSON.parse(await readFile(join(dir, ".mcp.json"), "utf8")) as {
      mcpServers: Record<string, Record<string, unknown>>;
      version: number;
    };
    expect(jsonConfig.version).toBe(1);
    expect(jsonConfig.mcpServers.other).toEqual({
      args: ["serve"],
      command: "other-tool",
    });
    expect(jsonConfig.mcpServers.lifecycle).toEqual({
      args: ["mcp"],
      command: "lifecycle",
      enabled: true,
    });

    const tomlConfig = await readFile(join(dir, ".codex", "config.toml"), "utf8");
    expect(tomlConfig).toContain('model = "gpt-5"');
    expect(tomlConfig).toContain("# keep this comment");
    expect(tomlConfig).toContain('notes = "keep me"');
    expect(tomlConfig).toContain('command = "lifecycle"');
    expect(tomlConfig).toMatch(/args = \[\s*"mcp"\s*\]/);
    expect(tomlConfig).toContain("[mcp_servers.other]");

    const jsonAfterFirstInstall = await readFile(join(dir, ".mcp.json"), "utf8");
    const tomlAfterFirstInstall = await readFile(join(dir, ".codex", "config.toml"), "utf8");

    expect(targets.map((target) => installMcpTarget(target, entry))).toEqual([
      "unchanged",
      "unchanged",
    ]);
    expect(await readFile(join(dir, ".mcp.json"), "utf8")).toBe(jsonAfterFirstInstall);
    expect(await readFile(join(dir, ".codex", "config.toml"), "utf8")).toBe(tomlAfterFirstInstall);
  });

  test("reports missing, outdated, and installed state without writing files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-cli-mcp-check-"));
    tempDirs.push(dir);

    const targets = resolveMcpTargets("project", dir);
    const entry = { args: ["mcp"], command: "lifecycle" };

    expect(targets.map((target) => checkMcpTarget(target, entry))).toEqual(["missing", "missing"]);

    await writeFile(
      join(dir, ".mcp.json"),
      `${JSON.stringify(
        {
          mcpServers: {
            lifecycle: {
              args: ["old"],
              command: "old-lifecycle",
            },
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
      ['[mcp_servers.lifecycle]', 'command = "lifecycle"', 'args = ["mcp"]', ""].join("\n"),
      "utf8",
    );

    expect(targets.map((target) => checkMcpTarget(target, entry))).toEqual([
      "outdated",
      "installed",
    ]);
  });
});
