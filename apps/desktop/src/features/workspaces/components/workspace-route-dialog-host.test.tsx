import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

describe("WorkspaceRouteDialogHost", () => {
  afterEach(() => {
    mock.restore();
  });

  test("renders the changes route as a canvas dialog", async () => {
    const gitDiffSurfaceModule = await import("../../git/components/git-diff-surface");

    spyOn(gitDiffSurfaceModule, "GitDiffSurface").mockImplementation((() =>
      createElement("div", { "data-slot": "git-diff-surface" }, "Git diff")) as never);

    const { WorkspaceRouteDialogHost } = await import("./workspace-route-dialog-host");
    const markup = renderToStaticMarkup(
      createElement(WorkspaceRouteDialogHost, {
        dialog: {
          focusPath: "src/app.tsx",
          kind: "changes",
        },
        onDialogChange: () => {},
        onOpenFile: () => {},
        workspaceId: "workspace-1",
      }),
    );

    expect(markup).toContain('data-slot="workspace-route-dialog"');
    expect(markup).toContain("absolute inset-0 z-30 flex min-h-0 flex-col");
    expect(markup).toContain('data-slot="workspace-route-dialog-backdrop"');
    expect(markup).toContain('data-slot="workspace-route-dialog-panel"');
    expect(markup).toContain("relative flex min-h-0 flex-1 flex-col overflow-hidden");
    expect(markup).toContain("backdrop-blur-[6px]");
    expect(markup).toContain("rounded-[14px]");
    expect(markup).toContain("Changes");
    expect(markup).toContain('aria-label="Close changes dialog"');
    expect(markup).toContain('data-slot="git-diff-surface"');
  });
});
