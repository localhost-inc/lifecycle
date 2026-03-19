import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LandingPage } from "./landing-page";

describe("LandingPage", () => {
  test("renders core messaging", () => {
    const markup = renderToStaticMarkup(createElement(LandingPage));

    expect(markup).toContain("Where teams and agents");
    expect(markup).toContain("collaborate on code.");
    expect(markup).toContain("One manifest in your repo.");
    expect(markup).toContain("lifecycle.json");
    expect(markup).toContain("Features");
    expect(markup).toContain("Download for Mac");
  });
});
