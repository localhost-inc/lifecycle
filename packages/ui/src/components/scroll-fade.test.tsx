import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScrollFade } from "./scroll-fade";

describe("ScrollFade", () => {
  test("renders matching gradient fades on both sides with a low overlay z-index", () => {
    const markup = renderToStaticMarkup(
      createElement(ScrollFade, { direction: "both" }, createElement("div", null, "content")),
    );

    expect(markup).toContain("bg-gradient-to-r");
    expect(markup).toContain("bg-gradient-to-l");
    expect(markup).toContain("z-[1]");
    expect(markup).not.toContain("bg-red-500");
    expect(markup).not.toContain("z-10");
  });

  test("renders matching vertical fades with the same low overlay z-index", () => {
    const markup = renderToStaticMarkup(
      createElement(ScrollFade, { direction: "vertical" }, createElement("div", null, "content")),
    );

    expect(markup).toContain("bg-gradient-to-b");
    expect(markup).toContain("bg-gradient-to-t");
    expect(markup).toContain("z-[1]");
  });
});
