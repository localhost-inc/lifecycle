import { describe, expect, test } from "bun:test";
import { slugWithSuffix, toSlug } from "./slug";

describe("slug helpers", () => {
  test("normalizes names into lowercase dash slugs", () => {
    expect(toSlug("Hello World")).toBe("hello-world");
    expect(toSlug("  repo/name  ")).toBe("repo-name");
  });

  test("falls back when the name has no slug characters", () => {
    expect(toSlug("___", "workspace")).toBe("workspace");
  });

  test("adds numeric suffixes for collisions", () => {
    expect(slugWithSuffix("hello-world", 1)).toBe("hello-world");
    expect(slugWithSuffix("hello-world", 2)).toBe("hello-world-2");
  });
});
