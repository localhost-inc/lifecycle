import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FloatingToggle } from "./floating-toggle";

describe("FloatingToggle", () => {
  test("renders the shared floating glass pill and active state", () => {
    const markup = renderToStaticMarkup(
      createElement(FloatingToggle, {
        ariaLabel: "Example toggle",
        onValueChange: () => {},
        options: [
          {
            ariaLabel: "First option",
            content: "First",
            itemClassName: "min-w-[76px] px-3 py-2",
            value: "first",
          },
          {
            ariaLabel: "Second option",
            content: "Second",
            itemClassName: "min-w-[76px] px-3 py-2",
            value: "second",
          },
        ] as const,
        value: "second",
      }),
    );

    expect(markup).toContain('data-slot="floating-toggle-wrapper"');
    expect(markup).toContain('data-slot="floating-toggle"');
    expect(markup).toContain('aria-label="Example toggle"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain("rounded-full border px-1 py-1");
  });
});
