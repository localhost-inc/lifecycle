import { describe, expect, test } from "bun:test";
import { Collapsible } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectItem } from "./project-item";

const project = {
  id: "project_1",
  path: "/tmp/project_1",
  name: "Control Plane",
  manifestPath: "lifecycle.json",
  manifestValid: true,
  organizationId: undefined,
  repositoryId: undefined,
  createdAt: "2026-03-01T12:00:00.000Z",
  updatedAt: "2026-03-07T12:00:00.000Z",
};

describe("ProjectItem", () => {
  test("keeps project actions hidden until the row is hovered or focused", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Collapsible,
        {
          defaultOpen: true,
        },
        createElement(ProjectItem, {
          project,
          selected: false,
          onCreateWorkspace: () => {},
          onRemoveProject: () => {},
          onSelect: () => {},
        }),
      ),
    );

    expect(markup).toContain("group-hover/menu-item:opacity-100");
    expect(markup).toContain("group-focus-within/menu-item:opacity-100");
    expect(markup).toContain("pointer-events-none");
    expect(markup).toContain("group-hover/menu-item:pointer-events-auto");
    expect(markup).toContain("group-focus-within/menu-item:pointer-events-auto");
    expect(markup).toContain('title="New workspace"');
  });

  test("renders a popover-triggered project menu with a remove action", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Collapsible,
        {
          defaultOpen: true,
        },
        createElement(ProjectItem, {
          project,
          selected: false,
          onCreateWorkspace: () => {},
          onRemoveProject: () => {},
          onSelect: () => {},
        }),
      ),
    );

    expect(markup).toContain('title="Project actions"');
    expect(markup).toContain('data-slot="popover-trigger"');
  });
});
