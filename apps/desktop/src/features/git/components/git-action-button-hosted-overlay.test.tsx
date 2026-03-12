import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const useHostedOverlay = mock((options: { payload: { resolvedTheme: string } }) => {
  capturedResolvedTheme = options.payload.resolvedTheme;
  return { hosted: true };
});

let capturedResolvedTheme: string | null = null;

mock.module("../../overlays/use-hosted-overlay", () => ({
  useHostedOverlay,
}));

const { GitActionButton } = await import("./git-action-button");

describe("GitActionButton hosted overlay", () => {
  beforeEach(() => {
    capturedResolvedTheme = null;
    useHostedOverlay.mockClear();
  });

  test("passes the resolved theme to the git actions overlay host", () => {
    renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(GitActionButton, {
          actionError: null,
          branchPullRequest: null,
          gitStatus: null,
          isCommitting: false,
          isCreatingPullRequest: false,
          isLoading: false,
          isMergingPullRequest: false,
          isPushingBranch: false,
          onCommit: async () => {},
          onCreatePullRequest: async () => {},
          onMergePullRequest: async () => {},
          onOpenPullRequest: () => {},
          onPushBranch: async () => {},
          onShowChanges: () => {},
        }),
        defaultPreference: { theme: "light" },
        storageKey: "lifecycle.desktop.theme.test",
      }),
    );

    expect(useHostedOverlay).toHaveBeenCalledTimes(1);
    expect(capturedResolvedTheme).toBe("light");
  });
});
