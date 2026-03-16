import { describe, expect, test } from "bun:test";
import type { ProjectRecord } from "@lifecycle/contracts";
import {
  buildShellContexts,
  filterProjectsForShellContext,
  resolveActiveShellContext,
  resolveProjectShellContextId,
} from "./shell-context";

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
  test("buildShellContexts always includes Personal and unique organization contexts", () => {
    const contexts = buildShellContexts(
      [
        createProjectRecord({ id: "project_1", name: "Lifecycle" }),
        createProjectRecord({ id: "project_2", name: "Kin API", organizationId: "org_2" }),
        createProjectRecord({ id: "project_3", name: "Ops", organizationId: "org_1" }),
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
      {
        id: "organization:org_1",
        kind: "organization",
        name: "Organization 1",
        organizationId: "org_1",
        persisted: true,
      },
      {
        id: "organization:org_2",
        kind: "organization",
        name: "Organization 2",
        organizationId: "org_2",
        persisted: true,
      },
    ]);
  });

  test("resolveProjectShellContextId maps null organization ids into Personal", () => {
    expect(
      resolveProjectShellContextId(createProjectRecord({ id: "project_1", name: "Lifecycle" })),
    ).toBe("personal");
    expect(
      resolveProjectShellContextId(
        createProjectRecord({ id: "project_2", name: "Kin API", organizationId: "org_1" }),
      ),
    ).toBe("organization:org_1");
  });

  test("filterProjectsForShellContext keeps only the projects for the chosen context", () => {
    const personalProject = createProjectRecord({ id: "project_1", name: "Lifecycle" });
    const organizationProject = createProjectRecord({
      id: "project_2",
      name: "Kin API",
      organizationId: "org_1",
    });
    const contexts = buildShellContexts([personalProject, organizationProject]);
    const personalContext = contexts[0];
    const organizationContext = contexts[1];

    if (!personalContext || !organizationContext) {
      throw new Error("Expected Personal and organization contexts to exist.");
    }

    expect(
      filterProjectsForShellContext([personalProject, organizationProject], personalContext),
    ).toEqual([personalProject]);
    expect(
      filterProjectsForShellContext([personalProject, organizationProject], organizationContext),
    ).toEqual([organizationProject]);
  });

  test("resolveActiveShellContext prefers the route project context over the stored context", () => {
    const projects = [
      createProjectRecord({ id: "project_1", name: "Lifecycle" }),
      createProjectRecord({ id: "project_2", name: "Kin API", organizationId: "org_1" }),
    ];
    const contexts = buildShellContexts(projects);
    const organizationContext = contexts[1];

    if (!organizationContext) {
      throw new Error("Expected an organization context to exist.");
    }

    expect(
      resolveActiveShellContext({
        contexts,
        projects,
        requestedContextId: "personal",
        routeProjectId: "project_2",
      }),
    ).toEqual(organizationContext);
  });

  test("resolveActiveShellContext falls back to the first non-empty context when Personal is empty", () => {
    const projects = [
      createProjectRecord({ id: "project_2", name: "Kin API", organizationId: "org_1" }),
    ];
    const contexts = buildShellContexts(projects);
    const organizationContext = contexts[1];

    if (!organizationContext) {
      throw new Error("Expected an organization context to exist.");
    }

    expect(
      resolveActiveShellContext({
        contexts,
        projects,
        requestedContextId: "personal",
        routeProjectId: undefined,
      }),
    ).toEqual(organizationContext);
  });
});
