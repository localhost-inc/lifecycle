import { afterEach, describe, expect, test } from "bun:test";
import { shouldAutoSelectWorkspacePaneFromPointerTarget } from "./workspace-pane-tree";

const originalElement = globalThis.Element;

afterEach(() => {
  if (originalElement === undefined) {
    delete (globalThis as { Element?: typeof Element }).Element;
    return;
  }

  (globalThis as { Element: typeof Element }).Element = originalElement;
});

describe("shouldAutoSelectWorkspacePaneFromPointerTarget", () => {
  test("does not auto-select a pane when the pointer starts on an interactive control", () => {
    class FakeElement {
      closest(selector: string) {
        return selector.includes("[data-tab-action]") ? this : null;
      }
    }

    (globalThis as { Element?: typeof Element }).Element = FakeElement as unknown as typeof Element;

    expect(
      shouldAutoSelectWorkspacePaneFromPointerTarget(new FakeElement() as unknown as EventTarget),
    ).toBe(false);
  });

  test("auto-selects a pane for null or non-control targets", () => {
    class FakeElement {
      closest() {
        return null;
      }
    }

    (globalThis as { Element?: typeof Element }).Element = FakeElement as unknown as typeof Element;

    expect(
      shouldAutoSelectWorkspacePaneFromPointerTarget(new FakeElement() as unknown as EventTarget),
    ).toBe(true);
    expect(shouldAutoSelectWorkspacePaneFromPointerTarget(null)).toBe(true);
  });
});
