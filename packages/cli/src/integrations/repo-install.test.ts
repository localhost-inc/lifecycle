import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { listRepoInstallProviders, runRepoInstall } from "./repo-install";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { force: true, recursive: true });
    }
  }
});

describe("repo install provider plan", () => {
  test("lists supported providers in prompt order", () => {
    expect(listRepoInstallProviders()).toEqual([
      {
        description: "Install project-scoped MCP config and Claude Code hooks.",
        id: "claude-code",
        label: "Claude Code",
      },
      {
        description: "Install project-scoped MCP config and Codex hooks.",
        id: "codex",
        label: "Codex",
      },
    ]);
  });

  test("installs only the selected provider targets plus shared hook adapter", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-cli-repo-provider-"));
    tempDirs.push(dir);

    const results = runRepoInstall({
      check: false,
      providerIds: ["codex"],
      repoPath: dir,
    });

    expect(results.map((result) => [result.harness_id, result.integration, result.status])).toEqual([
      ["lifecycle", "hook-adapter", "created"],
      ["codex", "hook-features", "created"],
      ["codex", "hooks", "created"],
      ["codex", "mcp", "updated"],
    ]);

    expect(await readFile(join(dir, ".lifecycle", "hooks", "activity.sh"), "utf8")).toContain(
      'workspace activity emit',
    );
    expect(await readFile(join(dir, ".codex", "hooks.json"), "utf8")).toContain("turn.started");
    expect(await readFile(join(dir, ".codex", "config.toml"), "utf8")).toContain("codex_hooks = true");
    expect(await readFile(join(dir, ".codex", "config.toml"), "utf8")).toContain(
      '[mcp_servers.lifecycle]',
    );
  });

  test("does not duplicate the shared hook adapter when multiple providers are selected", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-cli-repo-provider-all-"));
    tempDirs.push(dir);

    await mkdir(join(dir, ".lifecycle", "hooks"), { recursive: true });
    await writeFile(
      join(dir, ".lifecycle", "hooks", "activity.sh"),
      "#!/bin/sh\nexit 0\n",
      "utf8",
    );

    const results = runRepoInstall({
      check: true,
      providerIds: ["claude-code", "codex"],
      repoPath: dir,
    });

    expect(
      results.filter((result) => result.harness_id === "lifecycle" && result.integration === "hook-adapter"),
    ).toHaveLength(1);
    expect(results[0]).toMatchObject({
      harness_id: "lifecycle",
      integration: "hook-adapter",
      status: "outdated",
    });
  });
});
