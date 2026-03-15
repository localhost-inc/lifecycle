import { ThemeProvider } from "@lifecycle/ui";
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ProjectPageTabs } from "./project-page-tabs";

describe("ProjectPageTabs", () => {
  test("renders leading icons for each tab so tab types stay distinguishable", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        storageKey: "test.theme",
        children: createElement(MemoryRouter, {
          children: createElement(ProjectPageTabs, {
            activeTabId: "workspace:1",
            onCloseTab: () => {},
            onReorderTabs: () => {},
            onSelectTab: () => {},
            tabs: [
              {
                closable: false,
                icon: createElement("span", null, "O"),
                id: "view:overview",
                label: "Overview",
              },
              {
                closable: true,
                icon: createElement("span", null, "W"),
                id: "workspace:1",
                label: "Setup",
              },
              {
                closable: true,
                icon: createElement("span", null, "P"),
                id: "pull-request:42",
                label: "PR #42",
              },
            ],
          }),
        }),
      }),
    );

    expect(markup).toContain('data-slot="project-page-tabs"');
    expect(markup).toContain("bg-[var(--surface)]");
    expect(markup).toContain(">Overview<");
    expect(markup).toContain(">Setup<");
    expect(markup).toContain(">PR #42<");
    expect(markup.match(/aria-hidden="true"/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  test("renders actionsOutlet after the tab strip when provided", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        storageKey: "test.theme",
        children: createElement(MemoryRouter, {
          children: createElement(ProjectPageTabs, {
            actionsOutlet: createElement("button", null, "Fork"),
            activeTabId: "view:overview",
            onCloseTab: () => {},
            onReorderTabs: () => {},
            onSelectTab: () => {},
            tabs: [
              {
                closable: false,
                icon: createElement("span", null, "O"),
                id: "view:overview",
                label: "Overview",
              },
            ],
          }),
        }),
      }),
    );

    expect(markup).toContain(">Fork<");
    expect(markup).toContain("data-no-drag");
  });

  test("omits actionsOutlet container when not provided", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        storageKey: "test.theme",
        children: createElement(MemoryRouter, {
          children: createElement(ProjectPageTabs, {
            activeTabId: "view:overview",
            onCloseTab: () => {},
            onReorderTabs: () => {},
            onSelectTab: () => {},
            tabs: [
              {
                closable: false,
                icon: createElement("span", null, "O"),
                id: "view:overview",
                label: "Overview",
              },
            ],
          }),
        }),
      }),
    );

    expect(markup).not.toContain(">Fork<");
  });
});
