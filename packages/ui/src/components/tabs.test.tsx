import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

describe("Tabs", () => {
  test("renders the active state contract used by shared tab styling", () => {
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
    expect(markup).toContain("rounded-xl");
    expect(markup).toContain("bg-[var(--muted)]");
    expect(markup).toContain("border-l");
    expect(markup).toContain("data-[state=active]:bg-[var(--surface-selected)]");
  });

  test("supports underline tabs without reusing the segmented active fill", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Tabs,
        {
          value: "history",
        },
        createElement(
          TabsList,
          { variant: "underline" },
          createElement(TabsTrigger, { value: "changes", variant: "underline" }, "Changes"),
          createElement(TabsTrigger, { value: "history", variant: "underline" }, "History"),
        ),
        createElement(TabsContent, { value: "changes" }, "Changes panel"),
        createElement(TabsContent, { value: "history" }, "History panel"),
      ),
    );

    expect(markup).toContain("flex w-full items-stretch border-b border-[var(--border)]");
    expect(markup).toContain("shadow-[inset_0_-1px_0_0_transparent]");
    expect(markup).not.toContain("rounded-xl bg-[var(--muted)]");
  });
});
