import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SplitButton, SplitButtonPrimary, SplitButtonSecondary } from "../index";

describe("SplitButton", () => {
  test("renders a shared split-control shell with primary and secondary actions", () => {
    const markup = renderToStaticMarkup(
      createElement(SplitButton, {
        children: [
          createElement(SplitButtonPrimary, {
            key: "primary",
            children: "Open",
          }),
          createElement(SplitButtonSecondary, {
            "aria-label": "More actions",
            children: "v",
            key: "secondary",
          }),
        ],
      }),
    );

    expect(markup).toContain("rounded-xl");
    expect(markup).toContain("bg-[var(--muted)]");
    expect(markup).toContain("border-l");
    expect(markup).toContain("Open");
  });

  test("supports primary variants without changing the split layout", () => {
    const markup = renderToStaticMarkup(
      createElement(SplitButton, {
        children: [
          createElement(SplitButtonPrimary, {
            key: "primary",
            variant: "active",
            children: "Merge PR",
          }),
          createElement(SplitButtonSecondary, {
            "aria-label": "More actions",
            children: "v",
            key: "secondary",
          }),
        ],
      }),
    );

    expect(markup).toContain("bg-[var(--muted)]");
    expect(markup).toContain("Merge PR");
  });
});
