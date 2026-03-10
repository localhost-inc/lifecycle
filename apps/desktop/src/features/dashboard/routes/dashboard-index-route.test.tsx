import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const onCreateWorkspace = mock(() => {});
const useProjectCatalog = mock(() => ({
  data: {
    projects: [
      {
        id: "project_1",
        name: "kin",
      },
    ],
  },
  isLoading: false,
}));

mock.module("react-router-dom", () => ({
  useOutletContext: () => ({
    onCreateWorkspace,
  }),
  useSearchParams: () => [new URLSearchParams("project=project_1")],
}));

mock.module("../../projects/hooks", () => ({
  useProjectCatalog,
}));

const { DashboardIndexRoute } = await import("./dashboard-index-route");

describe("DashboardIndexRoute", () => {
  beforeEach(() => {
    onCreateWorkspace.mockClear();
    useProjectCatalog.mockClear();
  });

  test("renders the empty-state create action with the shared primary button treatment", () => {
    const markup = renderToStaticMarkup(createElement(DashboardIndexRoute));

    expect(markup).toContain("No workspace selected");
    expect(markup).toContain("Project kin has no active workspace yet.");
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain("bg-[var(--muted)]");
    expect(markup).toContain("text-[var(--foreground)]");
    expect(markup).toContain("h-8");
    expect(markup).toContain("+ New workspace");
  });
});
