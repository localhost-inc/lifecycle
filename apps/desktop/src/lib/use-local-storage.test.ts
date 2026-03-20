import { describe, expect, test } from "bun:test";
import {
  readLocalStorageValue,
  removeLocalStorageValue,
  writeLocalStorageValue,
} from "@/lib/use-local-storage";

function createStorage(initialEntries: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialEntries));

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("use local storage helpers", () => {
  test("reads a stored value and falls back when parsing or validation fails", () => {
    expect(
      readLocalStorageValue("diff-style", {
        defaultValue: "split",
        parse: (rawValue) => rawValue as "split" | "unified",
        storage: createStorage({
          "diff-style": "unified",
        }),
        validate: (value) => value === "split" || value === "unified",
      }),
    ).toBe("unified");

    expect(
      readLocalStorageValue("diff-style", {
        defaultValue: "split",
        parse: (rawValue) => rawValue as "split" | "unified",
        storage: createStorage({
          "diff-style": "stacked",
        }),
        validate: (value) => value === "split" || value === "unified",
      }),
    ).toBe("split");
  });

  test("writes and removes values with the provided serializer", () => {
    const storage = createStorage();

    writeLocalStorageValue("panel-width", 320, {
      serialize: (value) => String(value),
      storage,
    });

    expect(storage.getItem("panel-width")).toBe("320");

    removeLocalStorageValue("panel-width", storage);

    expect(storage.getItem("panel-width")).toBeNull();
  });
});
