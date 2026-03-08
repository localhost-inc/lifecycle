import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

describe("ToggleGroup", () => {
  test("keeps Radix-style single selection state markers on Base UI items", () => {
    const markup = renderToStaticMarkup(
      createElement(
        ToggleGroup,
        {
          type: "single",
          value: "working",
        },
        createElement(ToggleGroupItem, { value: "working" }, "Working"),
        createElement(ToggleGroupItem, { value: "staged" }, "Staged"),
      ),
    );

    expect(markup).toContain('data-state="on"');
    expect(markup).toContain('data-state="off"');
    expect(markup).toContain('data-slot="toggle-group-item"');
    expect(markup).toContain("cursor-pointer");
  });
});
