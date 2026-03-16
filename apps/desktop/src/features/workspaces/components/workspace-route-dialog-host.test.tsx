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
    expect(markup).toContain("Changes");
    expect(markup).toContain("src/app.tsx");
    expect(markup).toContain('data-slot="git-diff-surface"');
  });
});
