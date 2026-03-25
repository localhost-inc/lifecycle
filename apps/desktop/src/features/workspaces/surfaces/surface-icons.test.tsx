import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildWorkspaceSurfaceTabPresentation } from "@/features/workspaces/surfaces/workspace-surface-registry";

describe("buildWorkspaceSurfaceTabPresentation", () => {
  test("renders the codex icon by default for agent tabs", () => {
    const presentation = buildWorkspaceSurfaceTabPresentation({
      agentSessionId: "session-1",
      key: "agent:codex:session-1",
      kind: "agent",
      label: "Codex",
      provider: "codex",
    });

    const markup = renderToStaticMarkup(createElement("div", null, presentation.leading));

    expect(markup).toContain('data-surface-tab-icon="codex"');
    expect(markup).not.toContain("Generating response");
  });

  test("renders a spinner when the agent tab is running", () => {
    const presentation = buildWorkspaceSurfaceTabPresentation(
      {
        agentSessionId: "session-1",
        key: "agent:codex:session-1",
        kind: "agent",
        label: "Codex",
        provider: "codex",
      },
      { isRunning: true, needsAttention: false },
    );

    const markup = renderToStaticMarkup(createElement("div", null, presentation.leading));

    expect(markup).toContain("Generating response");
  });

  test("renders the response-ready indicator when the agent needs attention", () => {
    const presentation = buildWorkspaceSurfaceTabPresentation(
      {
        agentSessionId: "session-1",
        key: "agent:codex:session-1",
        kind: "agent",
        label: "Codex",
        provider: "codex",
      },
      { isRunning: true, needsAttention: true },
    );

    const markup = renderToStaticMarkup(createElement("div", null, presentation.leading));

    expect(markup).toContain('aria-label="Response ready"');
    expect(markup).not.toContain("Generating response");
  });
});
