import { describe, expect, test } from "bun:test";
import type { ProjectRecord } from "@lifecycle/contracts";
import {
  buildShellContexts,
  filterProjectsForShellContext,
  resolveActiveShellContext,
  resolveProjectShellContextId,
} from "@/features/projects/lib/shell-context";

function createProjectRecord(
  overrides: Partial<ProjectRecord> & Pick<ProjectRecord, "id" | "name">,
): ProjectRecord {
  const { id, name, ...rest } = overrides;
  return {
    createdAt: "2026-03-14T00:00:00.000Z",
    id,
    manifestPath: `/tmp/${id}/lifecycle.json`,
    manifestValid: true,
    name,
    path: `/tmp/${id}`,
    updatedAt: "2026-03-14T00:00:00.000Z",
    ...rest,
  };
}

describe("shell context helpers", () => {
  test("buildShellContexts always includes Personal context", () => {
    const contexts = buildShellContexts(
      [
        createProjectRecord({ id: "project_1", name: "Lifecycle" }),
        createProjectRecord({ id: "project_2", name: "Kin API" }),
      ],
      {
        personalContextPersisted: true,
      },
    );

    expect(contexts).toEqual([
      {
        id: "personal",
        kind: "personal",
        name: "Personal",
        persisted: true,
      },
    ]);
  });

  test("buildShellContexts uses personalDisplayName when provided", () => {
    const contexts = buildShellContexts(
      [createProjectRecord({ id: "project_1", name: "Lifecycle" })],
      { personalDisplayName: "Kyle" },
    );
    expect(contexts[0]?.name).toBe("Kyle");
  });

  test("buildShellContexts falls back to Personal when personalDisplayName is null", () => {
    const contexts = buildShellContexts(
      [createProjectRecord({ id: "project_1", name: "Lifecycle" })],
      { personalDisplayName: null },
    );
    expect(contexts[0]?.name).toBe("Personal");
  });

  test("resolveProjectShellContextId always returns personal", () => {
    expect(
      resolveProjectShellContextId(createProjectRecord({ id: "project_1", name: "Lifecycle" })),
    ).toBe("personal");
  });

  test("filterProjectsForShellContext returns all projects for the personal context", () => {
    const project1 = createProjectRecord({ id: "project_1", name: "Lifecycle" });
    const project2 = createProjectRecord({ id: "project_2", name: "Kin API" });
    const contexts = buildShellContexts([project1, project2]);
    const personalContext = contexts[0];

    if (!personalContext) {
      throw new Error("Expected Personal context to exist.");
    }

    expect(filterProjectsForShellContext([project1, project2], personalContext)).toEqual([
      project1,
      project2,
    ]);
  });

  test("resolveActiveShellContext returns the personal context", () => {
    const projects = [
      createProjectRecord({ id: "project_1", name: "Lifecycle" }),
      createProjectRecord({ id: "project_2", name: "Kin API" }),
    ];
    const contexts = buildShellContexts(projects);

    expect(
      resolveActiveShellContext({
        contexts,
        projects,
        requestedContextId: "personal",
        routeProjectId: "project_2",
      }),
    ).toEqual(contexts[0]!);
  });
});
