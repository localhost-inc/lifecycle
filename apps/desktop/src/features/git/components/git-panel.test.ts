import { describe, expect, test } from "bun:test";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryProvider } from "../../../query";
import {
  GIT_PANEL_BODY_CLASS_NAME,
  GIT_PANEL_EMPTY_STATE_CLASS_NAME,
  GIT_PANEL_HEADER_CLASS_NAME,
  GIT_PANEL_TABS,
  GIT_PANEL_TITLE,
  GitPanel,
} from "./git-panel";

function renderGitPanel(props: Partial<Parameters<typeof GitPanel>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(QueryProvider, {
      children: createElement(ThemeProvider, {
        children: createElement(GitPanel, {
          onOpenCommitDiff: () => {},
          onOpenDiff: () => {},
          workspaceId: "workspace_1",
          workspaceMode: "local",
          worktreePath: "/tmp/lifecycle",
          ...props,
        }),
        storageKey: "test.theme",
      }),
    }),
  );
}

describe("git panel spacing", () => {
  test("uses the tighter horizontal gutter across panel sections", () => {
    expect(GIT_PANEL_HEADER_CLASS_NAME).toContain("px-2.5");
    expect(GIT_PANEL_BODY_CLASS_NAME).toContain("px-2.5");
    expect(GIT_PANEL_EMPTY_STATE_CLASS_NAME).toContain("px-2.5");
    expect(GIT_PANEL_HEADER_CLASS_NAME).not.toContain("px-5");
    expect(GIT_PANEL_BODY_CLASS_NAME).not.toContain("px-5");
    expect(GIT_PANEL_EMPTY_STATE_CLASS_NAME).not.toContain("px-5");
  });

  test("labels the rail as Git and exposes the full tab set", () => {
    const markup = renderGitPanel();

    expect(markup).toContain(GIT_PANEL_TITLE);
    for (const tab of GIT_PANEL_TABS) {
      expect(markup).toContain(tab.label);
    }
  });

  test("uses underline tabs in the Git rail", () => {
    const markup = renderGitPanel();

    expect(markup).toContain("flex items-stretch border-b border-[var(--border)]");
    expect(markup).toContain("-mx-2.5");
    expect(markup).toContain("w-[calc(100%+1.25rem)]");
    expect(markup).toContain("flex-1");
    expect(markup).toContain("data-active:shadow-[inset_0_-3px_0_0_var(--foreground)]");
    expect(markup).not.toContain("data-active:bg-[var(--surface-selected)]");
  });

  test("describes the broader Git rail in cloud mode", () => {
    const markup = renderGitPanel({
      workspaceMode: "cloud",
      worktreePath: null,
    });

    expect(markup).toContain(GIT_PANEL_TITLE);
    expect(markup).toContain("Pull Requests");
    expect(markup).toContain("Changes unavailable");
    expect(markup).not.toContain("Checks");
  });
});
