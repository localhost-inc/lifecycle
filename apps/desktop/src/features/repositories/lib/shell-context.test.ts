import { describe, expect, test } from "bun:test";
import type { RepositoryRecord } from "@lifecycle/contracts";
import {
  buildShellContexts,
  filterRepositoriesForShellContext,
  resolveActiveShellContext,
  resolveRepositoryShellContextId,
} from "@/features/repositories/lib/shell-context";

function createRepositoryRecord(
  overrides: Partial<RepositoryRecord> & Pick<RepositoryRecord, "id" | "name">,
): RepositoryRecord {
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
        createRepositoryRecord({ id: "project_1", name: "Lifecycle" }),
        createRepositoryRecord({ id: "project_2", name: "Kin API" }),
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
      [createRepositoryRecord({ id: "project_1", name: "Lifecycle" })],
      { personalDisplayName: "Kyle" },
    );
    expect(contexts[0]?.name).toBe("Kyle");
  });

  test("buildShellContexts falls back to Personal when personalDisplayName is null", () => {
    const contexts = buildShellContexts(
      [createRepositoryRecord({ id: "project_1", name: "Lifecycle" })],
      { personalDisplayName: null },
    );
    expect(contexts[0]?.name).toBe("Personal");
  });

  test("resolveRepositoryShellContextId always returns personal", () => {
    expect(
      resolveRepositoryShellContextId(
        createRepositoryRecord({ id: "project_1", name: "Lifecycle" }),
      ),
    ).toBe("personal");
  });

  test("filterRepositoriesForShellContext returns all repositories for the personal context", () => {
    const repository1 = createRepositoryRecord({ id: "project_1", name: "Lifecycle" });
    const repository2 = createRepositoryRecord({ id: "project_2", name: "Kin API" });
    const contexts = buildShellContexts([repository1, repository2]);
    const personalContext = contexts[0];

    if (!personalContext) {
      throw new Error("Expected Personal context to exist.");
    }

    expect(filterRepositoriesForShellContext([repository1, repository2], personalContext)).toEqual([
      repository1,
      repository2,
    ]);
  });

  test("resolveActiveShellContext returns the personal context", () => {
    const repositories = [
      createRepositoryRecord({ id: "project_1", name: "Lifecycle" }),
      createRepositoryRecord({ id: "project_2", name: "Kin API" }),
    ];
    const contexts = buildShellContexts(repositories);

    expect(
      resolveActiveShellContext({
        contexts,
        repositories,
        requestedContextId: "personal",
        routeRepositoryId: "project_2",
      }),
    ).toEqual(contexts[0]!);
  });
});
