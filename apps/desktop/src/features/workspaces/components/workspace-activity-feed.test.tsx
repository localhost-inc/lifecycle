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
            detail: "Terminal 1",
            id: "activity-1",
            kind: "terminal.created",
            occurredAt: "2026-03-10T10:00:00.000Z",
            title: "Shell session started",
            tone: "success",
          },
        ],
      }),
    );

    expect(markup).toContain("Shell session started");
    expect(markup).toContain("Terminal 1");
    expect(markup).toContain("terminal.created");
  });

  test("renders an empty state when no workspace activity exists yet", () => {
    const markup = renderToStaticMarkup(createElement(WorkspaceActivityFeed, { items: [] }));

    expect(markup).toContain("No activity yet.");
  });
});
