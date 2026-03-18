import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LandingPage } from "./landing-page";

describe("LandingPage", () => {
  test("renders core messaging", () => {
    const markup = renderToStaticMarkup(createElement(LandingPage));

    expect(markup).toContain("One file.");
    expect(markup).toContain("Every environment.");
    expect(markup).toContain("lifecycle.json");
    expect(markup).toContain("How it works");
    expect(markup).toContain("Download for Mac");
  });
});
