import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

describe("Select", () => {
  test("renders the selected item label in the trigger when items are provided explicitly", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Select,
        {
          items: [
            { label: "Geist", value: "geist" },
            { label: "Inter", value: "inter" },
          ],
          value: "geist",
        },
        createElement(
          SelectTrigger,
          null,
          createElement(SelectValue, { placeholder: "Select a preset" }),
        ),
        createElement(
          SelectContent,
          null,
          createElement(SelectItem, { value: "geist" }, "Geist"),
          createElement(SelectItem, { value: "inter" }, "Inter"),
        ),
      ),
    );

    expect(markup).toContain('data-slot="select-value"');
    expect(markup).toContain('data-slot="select-value" class="flex flex-1 text-left">Geist</span>');
    expect(markup).toContain('value="geist"');
  });
});
