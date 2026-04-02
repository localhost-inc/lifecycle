import { describe, expect, test } from "bun:test";
import { ThemeProvider } from "@lifecycle/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WelcomeScreen } from "@/features/welcome/components/welcome-screen";

describe("WelcomeScreen", () => {
  test("renders the logo animation with the standard foreground color on first paint", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(WelcomeScreen, { onAddRepository: () => {} }),
        storageKey: "test.theme",
      }),
    );

    expect(markup).toContain('data-slot="logo"');
    expect(markup).toContain("text-[var(--foreground)]");
    expect(markup).toContain("animation-duration:1900ms");
    expect(markup).toContain("animation-timing-function:cubic-bezier(0.55, 0.085, 0.68, 0.53)");
  });
});
