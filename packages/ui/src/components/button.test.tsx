import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, buttonVariants } from "./button";

describe("buttonVariants", () => {
  test("uses the shared outline treatment", () => {
    const className = buttonVariants({ variant: "outline" });

    expect(className).toContain("cursor-pointer");
    expect(className).toContain("border ");
    expect(className).toContain("border-[var(--border)]");
    expect(className).toContain("hover:bg-[var(--surface-hover)]");
    expect(className).toContain("rounded-lg");
  });

  test("keeps ghost actions borderless", () => {
    const className = buttonVariants({ variant: "ghost" });

    expect(className).not.toContain("border ");
    expect(className).not.toContain("border-transparent");
    expect(className).toContain("bg-transparent");
  });
});

describe("Button", () => {
  test("renders a button element with a default button type", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Button,
        {
          variant: "outline",
        },
        "Launch",
      ),
    );

    expect(markup).toContain("<button");
    expect(markup).toContain('type="button"');
    expect(markup).toContain("Launch");
    expect(markup).toContain("cursor-pointer");
  });

  test("supports asChild rendering for link-like actions", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Button,
        {
          asChild: true,
          variant: "ghost",
        },
        createElement("a", { href: "/settings" }, "Settings"),
      ),
    );

    expect(markup).toContain("<a");
    expect(markup).toContain('href="/settings"');
    expect(markup).toContain("hover:bg-[var(--surface-hover)]");
    expect(markup).not.toContain("border-transparent");
  });
});
