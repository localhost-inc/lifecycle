import { describe, expect, test } from "bun:test";
import {
  readWorkspaceExplorerUsage,
  readWorkspaceExplorerUsageVersion,
  recordWorkspaceExplorerUsage,
  scoreWorkspaceExplorerUsage,
} from "@/features/explorer/lib/workspace-explorer-usage";

function createStorage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
} {
  const values = new Map<string, string>();

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe("workspace explorer usage", () => {
  test("records normalized file paths per workspace", () => {
    const storage = createStorage();

    recordWorkspaceExplorerUsage("workspace-1", "./docs/../README.md", {
      now: 100,
      storage,
    });
    recordWorkspaceExplorerUsage("workspace-1", "README.md", {
      now: 200,
      storage,
    });

    expect(readWorkspaceExplorerUsage("workspace-1", storage)).toEqual({
      "README.md": {
        count: 2,
        lastOpenedAt: 200,
      },
    });
  });

  test("scores recent and frequent files above stale ones", () => {
    const now = 10 * 3_600_000;

    expect(
      scoreWorkspaceExplorerUsage(
        {
          count: 5,
          lastOpenedAt: now - 60_000,
        },
        now,
      ),
    ).toBeGreaterThan(
      scoreWorkspaceExplorerUsage(
        {
          count: 1,
          lastOpenedAt: now - 7 * 24 * 3_600_000,
        },
        now,
      ),
    );
  });

  test("increments the store version when usage changes", () => {
    const storage = createStorage();
    const before = readWorkspaceExplorerUsageVersion();

    recordWorkspaceExplorerUsage("workspace-1", "README.md", {
      now: 100,
      storage,
    });

    expect(readWorkspaceExplorerUsageVersion()).toBe(before + 1);
  });
});
