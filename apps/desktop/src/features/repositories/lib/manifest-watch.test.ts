import { describe, expect, test } from "bun:test";
import { getManifestPath, watchEventTouchesManifest } from "@/features/repositories/lib/manifest-watch";

describe("manifest watch helpers", () => {
  test("builds the canonical lifecycle.json path for any watched directory", () => {
    expect(getManifestPath("/Users/kyle/dev/lifecycle")).toBe(
      "/users/kyle/dev/lifecycle/lifecycle.json",
    );
    expect(getManifestPath("C:\\Code\\Lifecycle\\")).toBe("c:/code/lifecycle/lifecycle.json");
  });

  test("matches manifest save events for unix and windows paths", () => {
    expect(
      watchEventTouchesManifest("/Users/kyle/dev/lifecycle", [
        "/Users/kyle/dev/lifecycle/lifecycle.json",
      ]),
    ).toBeTrue();

    expect(
      watchEventTouchesManifest("C:\\Code\\Lifecycle", ["C:\\Code\\Lifecycle\\lifecycle.json"]),
    ).toBeTrue();
  });

  test("ignores unrelated file changes", () => {
    expect(
      watchEventTouchesManifest("/Users/kyle/dev/lifecycle", [
        "/Users/kyle/dev/lifecycle/README.md",
      ]),
    ).toBeFalse();
  });
});
