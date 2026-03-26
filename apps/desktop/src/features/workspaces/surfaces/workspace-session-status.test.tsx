import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getWorkspaceSessionStatusState,
  WorkspaceSessionStatus,
} from "@/features/workspaces/surfaces/workspace-session-status";

describe("getWorkspaceSessionStatusState", () => {
  test("prefers ready over loading when both flags are present", () => {
    expect(
      getWorkspaceSessionStatusState({
        responseReady: true,
        running: true,
      }),
    ).toBe("ready");
  });

  test("returns loading when a workspace turn is still running", () => {
    expect(
      getWorkspaceSessionStatusState({
        responseReady: false,
        running: true,
      }),
    ).toBe("loading");
  });

  test("returns hidden when no session status should be shown", () => {
    expect(
      getWorkspaceSessionStatusState({
        responseReady: false,
        running: false,
      }),
    ).toBe("hidden");
  });
});

describe("WorkspaceSessionStatus", () => {
  test("renders the yellow ready indicator", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceSessionStatus, {
        state: "ready",
      }),
    );

    expect(markup).toContain('data-slot="workspace-session-status"');
    expect(markup).toContain('aria-label="Response ready"');
    expect(markup).toContain("lifecycle-motion-ready-ring");
    expect(markup).toContain("lifecycle-motion-soft-pulse");
  });

  test("renders the loading spinner in the same status slot", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceSessionStatus, {
        state: "loading",
      }),
    );

    expect(markup).toContain('data-slot="workspace-session-status"');
    expect(markup).toContain('data-slot="spinner"');
    expect(markup).toContain('title="Generating response"');
    expect(markup).not.toContain('aria-label="Response ready"');
  });

  test("renders nothing when the status is hidden", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceSessionStatus, {
        state: "hidden",
      }),
    );

    expect(markup).toBe("");
  });
});
