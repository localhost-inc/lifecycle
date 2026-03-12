import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SetupProgress } from "./setup-progress";

describe("SetupProgress", () => {
  test("shows a disclosure affordance when a step has output", () => {
    const markup = renderToStaticMarkup(
      createElement(SetupProgress, {
        steps: [
          {
            name: "Install dependencies",
            output: ["bun install"],
            status: "running",
          },
        ],
      }),
    );

    expect(markup).toContain("Install dependencies");
    expect(markup).toContain("▶");
    expect(markup).not.toContain("disabled");
  });

  test("disables expansion when a step has no output", () => {
    const markup = renderToStaticMarkup(
      createElement(SetupProgress, {
        steps: [
          {
            name: "Generate manifest",
            output: [],
            status: "completed",
          },
        ],
      }),
    );

    expect(markup).toContain("Generate manifest");
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("▶");
  });

  test("renders output inline when expandOutputByDefault is enabled", () => {
    const markup = renderToStaticMarkup(
      createElement(SetupProgress, {
        expandOutputByDefault: true,
        steps: [
          {
            name: "Install dependencies",
            output: ["bun install"],
            status: "running",
          },
        ],
      }),
    );

    expect(markup).toContain("Install dependencies");
    expect(markup).toContain("bun install");
    expect(markup).toContain("▼");
  });
});
