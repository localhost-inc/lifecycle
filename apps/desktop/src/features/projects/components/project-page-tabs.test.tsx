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
    expect(markup).toContain(">Overview<");
    expect(markup).toContain(">Setup<");
    expect(markup).toContain(">PR #42<");
    expect(markup.match(/aria-hidden="true"/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
