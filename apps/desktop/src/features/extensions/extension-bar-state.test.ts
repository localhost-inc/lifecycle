import { describe, expect, test } from "bun:test";
import type { StorageLike } from "@/lib/panel-layout";
import {
  readPersistedActiveExtensionId,
  readPersistedExtensionPreference,
  toggleActiveExtension,
  writePersistedActiveExtensionId,
  writePersistedExtensionPreference,
} from "@/features/extensions/extension-bar-state";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("extension bar state", () => {
  test("toggles the active extension id when the same extension is selected twice", () => {
    expect(toggleActiveExtension(null, "git")).toBe("git");
    expect(toggleActiveExtension("git", "git")).toBeNull();
    expect(toggleActiveExtension("git", "environment")).toBe("environment");
  });

  test("persists the active extension id per workspace", () => {
    const storage = new MemoryStorage();

    expect(readPersistedActiveExtensionId("workspace-1", storage)).toBeNull();

    writePersistedActiveExtensionId("workspace-1", "git", storage);
    writePersistedActiveExtensionId("workspace-2", "environment", storage);

    expect(readPersistedActiveExtensionId("workspace-1", storage)).toBe("git");
    expect(readPersistedActiveExtensionId("workspace-2", storage)).toBe("environment");

    writePersistedActiveExtensionId("workspace-1", null, storage);
    expect(readPersistedActiveExtensionId("workspace-1", storage)).toBeNull();
  });

  test("persists extension preferences per workspace and key", () => {
    const storage = new MemoryStorage();

    expect(
      readPersistedExtensionPreference("workspace-1", "environment-tab", "overview", storage),
    ).toBe("overview");

    writePersistedExtensionPreference("workspace-1", "environment-tab", "logs", storage);
    writePersistedExtensionPreference("workspace-2", "environment-tab", "topology", storage);

    expect(
      readPersistedExtensionPreference("workspace-1", "environment-tab", "overview", storage),
    ).toBe("logs");
    expect(
      readPersistedExtensionPreference("workspace-2", "environment-tab", "overview", storage),
    ).toBe("topology");
  });
});
