import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { applyLifecycleInstall, inspectLifecycleInstall } from "./service";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { force: true, recursive: true });
    }
  }
});

describe("install service", () => {
  test("supports user-scoped managed docs without a repository path", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "lifecycle-install-user-scope-"));
    tempDirs.push(homeDir);

    const inspection = await inspectLifecycleInstall(
      { documentScope: "user" },
      { homeDir, platform: "win32" },
    );

    expect(inspection.document_scope).toBe("user");
    expect(inspection.steps.find((step) => step.id === "agents-md")).toMatchObject({
      path: join(homeDir, "AGENTS.md"),
      scope: "user",
      status: "missing",
    });
    expect(inspection.steps.find((step) => step.id === "claude-md")).toMatchObject({
      path: join(homeDir, "CLAUDE.md"),
      scope: "user",
      status: "missing",
    });
  });

  test("applies user-scoped managed docs into the provided home directory", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "lifecycle-install-user-apply-"));
    tempDirs.push(homeDir);

    const result = await applyLifecycleInstall(
      {
        documentScope: "user",
        stepIds: ["agents-md", "claude-md"],
      },
      { homeDir, platform: "win32" },
    );

    expect(result.ready).toBe(true);
    expect(result.steps).toEqual([
      expect.objectContaining({ id: "agents-md", scope: "user", status: "applied" }),
      expect.objectContaining({ id: "claude-md", scope: "user", status: "applied" }),
    ]);
    expect(await readFile(join(homeDir, "AGENTS.md"), "utf8")).toContain(
      "Lifecycle workspace awareness",
    );
    expect(await readFile(join(homeDir, "CLAUDE.md"), "utf8")).toContain(
      "Lifecycle workspace awareness",
    );
  });

  test("marks the proxy step as requiring elevation on supported platforms when not root", async () => {
    const repoPath = await mkdtemp(join(tmpdir(), "lifecycle-install-proxy-"));
    tempDirs.push(repoPath);

    const inspection = await inspectLifecycleInstall(
      { documentScope: "project", repoPath },
      { isRoot: false, platform: "linux" },
    );

    expect(inspection.steps.find((step) => step.id === "proxy")).toMatchObject({
      requires_elevation: true,
      scope: "machine",
      status: "missing",
    });
  });
});
