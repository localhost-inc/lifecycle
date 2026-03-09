import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

describe("Tabs", () => {
  test("preserves active state compatibility for consumer class selectors", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Tabs,
        {
          value: "history",
        },
        createElement(
          TabsList,
          null,
          createElement(TabsTrigger, { value: "changes" }, "Changes"),
          createElement(TabsTrigger, { value: "history" }, "History"),
        ),
        createElement(TabsContent, { value: "changes" }, "Changes panel"),
        createElement(TabsContent, { value: "history" }, "History panel"),
      ),
    );

    expect(markup).toContain('data-state="active"');
    expect(markup).toContain('data-state="inactive"');
    expect(markup).toContain('data-slot="tabs-trigger"');
    expect(markup).toContain('data-slot="tabs-list"');
    expect(markup).toContain("compact-control-shell");
    expect(markup).toContain("compact-control-tab");
    expect(markup).toContain("compact-control-divider");
    expect(markup).toContain("data-active:bg-[var(--surface-selected)]");
    expect(markup).toContain("data-[state=active]:bg-[var(--surface-selected)]");
  });
});
