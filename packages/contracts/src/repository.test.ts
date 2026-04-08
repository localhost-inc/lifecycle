import { describe, expect, test } from "bun:test";
import type { RepositoryRecord } from "./repository";

describe("RepositoryRecord", () => {
  test("accepts a valid repository record", () => {
    const repository: RepositoryRecord = {
      id: "repo_001",
      path: "/Users/dev/my-project",
      name: "my-project",
      slug: "my-project",
      manifestPath: "lifecycle.json",
      manifestValid: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(repository.id).toBe("repo_001");
    expect(repository.name).toBe("my-project");
    expect(repository.manifestValid).toBe(true);
  });

  test("does not require optional fields beyond the core record shape", () => {
    const repository: RepositoryRecord = {
      id: "repo_002",
      path: "/Users/dev/another",
      name: "another",
      slug: "another",
      manifestPath: "lifecycle.json",
      manifestValid: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(repository.id).toBe("repo_002");
    expect(repository.manifestValid).toBe(false);
  });
});
