import { afterEach, describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

describe("PreviewSurface", () => {
  afterEach(() => {
    mock.restore();
  });

  test("renders an iframe-backed preview surface", async () => {
    const { PreviewSurface } = await import("./preview-surface");

    const markup = renderToStaticMarkup(
      createElement(PreviewSurface, {
        tabKey: "preview:service:web",
        title: "web",
        url: "http://web.sydney.lifecycle.localhost",
      }),
    );

    expect(markup).toContain('data-slot="preview-surface"');
    expect(markup).toContain('src="http://web.sydney.lifecycle.localhost"');
    expect(markup).toContain('title="web"');
  });
});
