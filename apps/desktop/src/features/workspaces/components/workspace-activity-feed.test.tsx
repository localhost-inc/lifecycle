import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceActivityFeed } from "@/features/workspaces/components/workspace-activity-feed";

describe("WorkspaceActivityFeed", () => {
  test("renders launcher activity rows and the raw event kind", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceActivityFeed, {
        items: [
          {
            detail: "session abcd1234",
            id: "activity-1",
            kind: "terminal.harness_turn_completed",
            occurredAt: "2026-03-10T10:00:00.000Z",
            title: "Codex turn completed",
            tone: "success",
          },
        ],
      }),
    );

    expect(markup).toContain("Codex turn completed");
    expect(markup).toContain("session abcd1234");
    expect(markup).toContain("terminal.harness_turn_completed");
  });

  test("renders an empty state when no workspace activity exists yet", () => {
    const markup = renderToStaticMarkup(createElement(WorkspaceActivityFeed, { items: [] }));

    expect(markup).toContain("No activity yet.");
  });
});
