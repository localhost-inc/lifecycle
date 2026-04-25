import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  checkManagedDocumentTarget,
  installManagedDocumentTarget,
  managedDocumentBlock,
  resolveManagedDocumentTargets,
} from "./managed-docs";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { force: true, recursive: true });
    }
  }
});

describe("managed docs installer", () => {
  test("creates missing AGENTS.md and CLAUDE.md files with the lifecycle managed block", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-cli-managed-docs-"));
    tempDirs.push(dir);

    const targets = resolveManagedDocumentTargets({ projectPath: dir, scope: "project" });
    expect(targets.map((target) => installManagedDocumentTarget(target))).toEqual([
      "created",
      "created",
    ]);

    expect(await readFile(join(dir, "AGENTS.md"), "utf8")).toBe(`${managedDocumentBlock}\n`);
    expect(await readFile(join(dir, "CLAUDE.md"), "utf8")).toBe(`${managedDocumentBlock}\n`);
  });

  test("replaces only the managed block and preserves surrounding user content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-cli-managed-docs-preserve-"));
    tempDirs.push(dir);

    const agentsPath = join(dir, "AGENTS.md");
    await writeFile(
      agentsPath,
      [
        "# Repo instructions",
        "",
        "Keep this intro.",
        "",
        "<!-- lifecycle:managed:start -->",
        "old block",
        "<!-- lifecycle:managed:end -->",
        "",
        "Keep this footer.",
        "",
      ].join("\n"),
      "utf8",
    );

    const [agentsTarget] = resolveManagedDocumentTargets({ projectPath: dir, scope: "project" });
    expect(checkManagedDocumentTarget(agentsTarget!)).toBe("outdated");
    expect(installManagedDocumentTarget(agentsTarget!)).toBe("updated");
    expect(installManagedDocumentTarget(agentsTarget!)).toBe("unchanged");

    expect(await readFile(agentsPath, "utf8")).toBe(
      [
        "# Repo instructions",
        "",
        "Keep this intro.",
        "",
        managedDocumentBlock,
        "",
        "Keep this footer.",
        "",
      ].join("\n"),
    );
  });

  test("appends the managed block when a file exists without one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lifecycle-cli-managed-docs-append-"));
    tempDirs.push(dir);

    const claudePath = join(dir, "CLAUDE.md");
    await writeFile(claudePath, "# Project notes\n\nKeep me.\n", "utf8");

    const targets = resolveManagedDocumentTargets({ projectPath: dir, scope: "project" });
    const claudeTarget = targets.find((target) => target.id === "claude-md");
    expect(claudeTarget).not.toBeUndefined();
    expect(checkManagedDocumentTarget(claudeTarget!)).toBe("missing");
    expect(installManagedDocumentTarget(claudeTarget!)).toBe("updated");

    expect(await readFile(claudePath, "utf8")).toBe(
      `# Project notes\n\nKeep me.\n\n${managedDocumentBlock}\n`,
    );
  });
});
