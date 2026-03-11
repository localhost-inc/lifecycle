import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Card } from "./card";

describe("Card", () => {
  test("uses the shared 12px radius treatment", () => {
    const markup = renderToStaticMarkup(createElement(Card, null, "Content"));

    expect(markup).toContain("rounded-xl");
  });
});
