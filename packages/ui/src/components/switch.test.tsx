import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Switch } from "./switch";

describe("Switch", () => {
  test("renders checked and unchecked states with accessible switch semantics", () => {
    const checkedMarkup = renderToStaticMarkup(
      createElement(Switch, { checked: true, id: "dim-inactive-panes" }),
    );
    const uncheckedMarkup = renderToStaticMarkup(
      createElement(Switch, { checked: false, id: "dim-inactive-panes" }),
    );

    expect(checkedMarkup).toContain('data-slot="switch"');
    expect(checkedMarkup).toContain('role="switch"');
    expect(checkedMarkup).toContain('aria-checked="true"');
    expect(checkedMarkup).toContain("data-checked");
    expect(checkedMarkup).toContain('data-slot="switch-thumb"');

    expect(uncheckedMarkup).toContain('aria-checked="false"');
    expect(uncheckedMarkup).toContain("data-unchecked");
  });
});
