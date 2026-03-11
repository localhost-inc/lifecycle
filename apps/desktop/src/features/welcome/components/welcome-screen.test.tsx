import { describe, expect, test } from "bun:test";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WelcomeScreen } from "./welcome-screen";

describe("WelcomeScreen", () => {
  test("renders the logo animation with the standard foreground color on first paint", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(WelcomeScreen, { onAddProject: () => {} }),
        storageKey: "test.theme",
      }),
    );

    expect(markup).toContain('data-slot="logo"');
    expect(markup).toContain("text-[var(--foreground)]");
    expect(markup).toContain("animation-duration:2200ms");
  });
});
