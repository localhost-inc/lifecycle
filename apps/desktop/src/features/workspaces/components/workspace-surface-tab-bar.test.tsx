import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceSurfaceTabBar } from "./workspace-surface-tab-bar";

describe("WorkspaceSurfaceTabBar", () => {
  test("renders caller-provided leading content for surface tabs", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceSurfaceTabBar, {
        activeTabKey: "terminal:term-1",
        onCloseDocumentTab: () => {},
        onCloseRuntimeTab: async () => {},

        onSelectTab: () => {},
        onSetTabOrder: () => {},
        renderTabLeading: (tab) =>
          createElement("span", { "data-slot": "custom-leading" }, `lead:${tab.key}`),
        visibleTabs: [
          {
            harnessProvider: "claude",
            key: "terminal:term-1",
            type: "terminal",
            label: "Claude",
            launchType: "harness",
            responseReady: false,
            status: "active",
            terminalId: "term-1",
          },
        ],
      }),
    );

    expect(markup).toContain('data-slot="custom-leading"');
    expect(markup).toContain("lead:terminal:term-1");
  });

  test("does not render a status dot for a plain terminal tab", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceSurfaceTabBar, {
        activeTabKey: "terminal:term-1",
        onCloseDocumentTab: () => {},
        onCloseRuntimeTab: async () => {},

        onSelectTab: () => {},
        onSetTabOrder: () => {},
        visibleTabs: [
          {
            key: "terminal:term-1",
            harnessProvider: null,
            type: "terminal",
            label: "Terminal 1",
            launchType: "shell",
            responseReady: false,
            status: "detached",
            terminalId: "term-1",
          },
        ],
      }),
    );

    expect(markup).not.toContain('title="detached"');
    expect(markup).not.toContain('aria-label="Response ready"');
  });

  test("does not render the floating ready badge for the active terminal tab", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceSurfaceTabBar, {
        activeTabKey: "terminal:term-1",
        onCloseDocumentTab: () => {},
        onCloseRuntimeTab: async () => {},

        onSelectTab: () => {},
        onSetTabOrder: () => {},
        visibleTabs: [
          {
            key: "terminal:term-1",
            harnessProvider: null,
            type: "terminal",
            label: "Terminal 1",
            launchType: "shell",
            responseReady: true,
            status: "detached",
            terminalId: "term-1",
          },
        ],
      }),
    );

    expect(markup).not.toContain('aria-label="Response ready"');
    expect(markup).not.toContain("pointer-events-none absolute right-3 top-1.5");
    expect(markup).not.toContain('title="detached"');
  });

  test("renders the floating ready badge for an inactive ready terminal tab", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceSurfaceTabBar, {
        activeTabKey: "terminal:term-2",
        onCloseDocumentTab: () => {},
        onCloseRuntimeTab: async () => {},

        onSelectTab: () => {},
        onSetTabOrder: () => {},
        visibleTabs: [
          {
            key: "terminal:term-1",
            harnessProvider: null,
            type: "terminal",
            label: "Terminal 1",
            launchType: "shell",
            responseReady: true,
            status: "detached",
            terminalId: "term-1",
          },
          {
            key: "terminal:term-2",
            harnessProvider: null,
            type: "terminal",
            label: "Terminal 2",
            launchType: "shell",
            responseReady: false,
            status: "detached",
            terminalId: "term-2",
          },
        ],
      }),
    );

    expect(markup).toContain('aria-label="Response ready"');
    expect(markup).toContain("pointer-events-none absolute right-3 top-1.5");
    expect(markup).not.toContain('title="detached"');
  });
});
