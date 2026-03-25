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
            detail: "api",
            id: "activity-1",
            kind: "service.status.changed",
            occurredAt: "2026-03-10T10:00:00.000Z",
            title: "Service api ready",
            tone: "success",
          },
        ],
      }),
    );

    expect(markup).toContain("Service api ready");
    expect(markup).toContain("api");
    expect(markup).toContain("service.status.changed");
  });

  test("renders an empty state when no workspace activity exists yet", () => {
    const markup = renderToStaticMarkup(createElement(WorkspaceActivityFeed, { items: [] }));

    expect(markup).toContain("No activity yet.");
  });
});
