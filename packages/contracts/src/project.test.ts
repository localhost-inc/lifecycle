import { describe, expect, test } from "bun:test";
import type { ProjectRecord } from "./project";

describe("ProjectRecord", () => {
  test("accepts a valid project record", () => {
    const project: ProjectRecord = {
      id: "proj_001",
      path: "/Users/dev/my-project",
      name: "my-project",
      manifestPath: "lifecycle.json",
      manifestValid: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(project.id).toBe("proj_001");
    expect(project.name).toBe("my-project");
    expect(project.manifestValid).toBe(true);
  });

  test("does not require optional fields beyond the core record shape", () => {
    const project: ProjectRecord = {
      id: "proj_002",
      path: "/Users/dev/another",
      name: "another",
      manifestPath: "lifecycle.json",
      manifestValid: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(project.id).toBe("proj_002");
    expect(project.manifestValid).toBe(false);
  });
});
