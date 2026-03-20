import { describe, expect, test } from "bun:test";
import {
  readWorkspaceFileUsage,
  readWorkspaceFileUsageVersion,
  recordWorkspaceFileUsage,
  scoreWorkspaceFileUsage,
} from "@/features/files/lib/workspace-file-usage";

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

describe("workspace file usage", () => {
  test("records normalized file paths per workspace", () => {
    const storage = createStorage();

    recordWorkspaceFileUsage("workspace-1", "./docs/../README.md", {
      now: 100,
      storage,
    });
    recordWorkspaceFileUsage("workspace-1", "README.md", {
      now: 200,
      storage,
    });

    expect(readWorkspaceFileUsage("workspace-1", storage)).toEqual({
      "README.md": {
        count: 2,
        lastOpenedAt: 200,
      },
    });
  });

  test("scores recent and frequent files above stale ones", () => {
    const now = 10 * 3_600_000;

    expect(
      scoreWorkspaceFileUsage(
        {
          count: 5,
          lastOpenedAt: now - 60_000,
        },
        now,
      ),
    ).toBeGreaterThan(
      scoreWorkspaceFileUsage(
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
    const before = readWorkspaceFileUsageVersion();

    recordWorkspaceFileUsage("workspace-1", "README.md", {
      now: 100,
      storage,
    });

    expect(readWorkspaceFileUsageVersion()).toBe(before + 1);
  });
});
