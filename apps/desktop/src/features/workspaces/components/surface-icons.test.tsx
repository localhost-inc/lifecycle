import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createChangesDiffTab,
  createCommitDiffTab,
  createFileViewerTab,
  createPullRequestTab,
} from "../state/workspace-surface-state";
import { WorkspaceSurfaceTabLeading } from "./surface-icons";

describe("WorkspaceSurfaceTabLeading", () => {
  test("renders provider iconography and ready state for harness tabs", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceSurfaceTabLeading, {
        tab: {
          harnessProvider: "claude",
          key: "terminal:term-1",
          kind: "terminal",
          label: "Claude · auth-fix",
          launchType: "harness",
          running: true,
          responseReady: true,
          status: "active",
          terminalId: "term-1",
        },
      }),
    );

    expect(markup).toContain('data-surface-tab-icon="claude"');
    expect(markup).toContain('data-slot="spinner"');
    expect(markup).toContain('title="Response ready"');
    expect(markup).not.toContain('title="active"');
  });

  test("omits the spinner and status dot for inactive terminal tabs", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceSurfaceTabLeading, {
        tab: {
          harnessProvider: null,
          key: "terminal:term-2",
          kind: "terminal",
          label: "Shell",
          launchType: "shell",
          running: false,
          responseReady: false,
          status: "detached",
          terminalId: "term-2",
        },
      }),
    );

    expect(markup).not.toContain('data-slot="spinner"');
    expect(markup).not.toContain('title="detached"');
  });

  test("renders distinct visuals for document surface types", () => {
    const markup = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(WorkspaceSurfaceTabLeading, {
          tab: createChangesDiffTab("src/app.tsx"),
        }),
        createElement(WorkspaceSurfaceTabLeading, {
          tab: createCommitDiffTab("abc12345"),
        }),
        createElement(WorkspaceSurfaceTabLeading, {
          tab: createFileViewerTab("docs/readme.md"),
        }),
        createElement(WorkspaceSurfaceTabLeading, {
          tab: createFileViewerTab("design/mock.pen"),
        }),
        createElement(WorkspaceSurfaceTabLeading, {
          tab: createPullRequestTab({
            author: "kyle",
            baseRefName: "main",
            checks: null,
            createdAt: "2026-03-10T10:00:00.000Z",
            headRefName: "feature/pull-request-surface",
            isDraft: false,
            mergeStateStatus: "CLEAN",
            mergeable: "mergeable",
            number: 42,
            reviewDecision: "approved",
            state: "open",
            title: "feat: add pull request surface",
            updatedAt: "2026-03-10T11:00:00.000Z",
            url: "https://github.com/example/repo/pull/42",
          }),
        }),
      ),
    );

    expect(markup).toContain('data-surface-tab-icon="changes-diff"');
    expect(markup).toContain('data-surface-tab-icon="commit-diff"');
    expect(markup).toContain('data-surface-tab-icon="file-viewer"');
    expect(markup).toContain('data-surface-tab-icon="file-viewer-pencil"');
    expect(markup).toContain('data-surface-tab-icon="pull-request"');
  });
});
