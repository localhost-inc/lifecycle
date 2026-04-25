import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { generateWorkspaceTitle } from "./title";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { force: true, recursive: true });
    }
  }
});

describe("workspace title generation", () => {
  test("prefers codex prompt execution when available", async () => {
    const binDir = await createFakeBin({
      codex: "#!/bin/sh\necho Codex Generated Title\n",
      claude: "#!/bin/sh\necho Claude Generated Title\n",
    });

    await expect(
      generateWorkspaceTitle(
        {
          prompt: "Please fix the failing desktop tab title behavior.",
        },
        { PATH: binDir },
      ),
    ).resolves.toBe("Codex Generated Title");
  });

  test("falls back to claude when codex is unavailable", async () => {
    const binDir = await createFakeBin({
      claude: "#!/bin/sh\necho Claude Generated Title\n",
    });

    await expect(
      generateWorkspaceTitle(
        {
          prompt: "Please fix the failing desktop tab title behavior.",
        },
        { PATH: binDir },
      ),
    ).resolves.toBe("Claude Generated Title");
  });

  test("falls back to a local heuristic when model generators are unavailable", async () => {
    await expect(
      generateWorkspaceTitle(
        {
          prompt: "we're testing our title generation",
        },
        { PATH: "" },
      ),
    ).resolves.toBe("Testing Title Generation");
  });

  test("uses a local heuristic when model generators fail", async () => {
    const binDir = await createFakeBin({
      codex: "#!/bin/sh\nexit 1\n",
      claude: "#!/bin/sh\nexit 1\n",
    });

    await expect(
      generateWorkspaceTitle(
        {
          prompt: "Please fix the failing desktop tab title behavior.",
        },
        { PATH: binDir },
      ),
    ).resolves.toBe("Fix Failing Desktop Tab Title Behavior");
  });
});

async function createFakeBin(binaries: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "lifecycle-title-test-"));
  tempDirs.push(dir);
  await mkdir(dir, { recursive: true });

  for (const [name, contents] of Object.entries(binaries)) {
    const path = join(dir, name);
    await writeFile(path, contents, "utf8");
    await chmod(path, 0o755);
  }

  return dir;
}
