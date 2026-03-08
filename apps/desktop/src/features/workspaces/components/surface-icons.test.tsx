import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createChangesDiffTab,
  createCommitDiffTab,
  createLauncherTab,
} from "../state/workspace-surface-state";
import { WorkspaceSurfaceTabLeading } from "./surface-icons";

describe("WorkspaceSurfaceTabLeading", () => {
  test("renders provider iconography and runtime badges for harness tabs", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceSurfaceTabLeading, {
        tab: {
          harnessProvider: "claude",
          key: "terminal:term-1",
          type: "terminal",
          label: "Claude · auth-fix",
          launchType: "harness",
          responseReady: true,
          status: "active",
          terminalId: "term-1",
        },
      }),
    );

    expect(markup).toContain('data-surface-tab-icon="claude"');
    expect(markup).toContain('title="Response ready"');
    expect(markup).toContain('title="active"');
  });

  test("renders distinct visuals for launcher and diff surfaces", () => {
    const markup = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(WorkspaceSurfaceTabLeading, {
          tab: createLauncherTab("launcher-1"),
        }),
        createElement(WorkspaceSurfaceTabLeading, {
          tab: createChangesDiffTab("src/app.tsx"),
        }),
        createElement(WorkspaceSurfaceTabLeading, {
          tab: createCommitDiffTab("abc12345"),
        }),
      ),
    );

    expect(markup).toContain('data-surface-tab-icon="launcher"');
    expect(markup).toContain('data-surface-tab-icon="changes-diff"');
    expect(markup).toContain('data-surface-tab-icon="commit-diff"');
  });
});
