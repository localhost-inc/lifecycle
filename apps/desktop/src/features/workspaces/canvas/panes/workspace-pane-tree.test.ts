import { afterEach, describe, expect, test } from "bun:test";
import {
  resolveWorkspacePaneOpacity,
  shouldAutoSelectWorkspacePaneFromPointerTarget,
} from "@/features/workspaces/canvas/panes/workspace-pane-tree";

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

describe("resolveWorkspacePaneOpacity", () => {
  test("dims only inactive panes that are not hovered", () => {
    expect(
      resolveWorkspacePaneOpacity({
        dimInactivePanes: true,
        inactivePaneOpacity: 0.45,
        isActivePane: false,
        isHoveredPane: false,
      }),
    ).toBe(0.45);
  });

  test("keeps active panes at full opacity", () => {
    expect(
      resolveWorkspacePaneOpacity({
        dimInactivePanes: true,
        inactivePaneOpacity: 0.45,
        isActivePane: true,
        isHoveredPane: false,
      }),
    ).toBe(1);
  });

  test("hovered inactive panes split the difference between dim and full opacity", () => {
    expect(
      resolveWorkspacePaneOpacity({
        dimInactivePanes: true,
        inactivePaneOpacity: 0.45,
        isActivePane: false,
        isHoveredPane: true,
      }),
    ).toBe(0.725);
  });

  test("does not dim when the feature is disabled", () => {
    expect(
      resolveWorkspacePaneOpacity({
        dimInactivePanes: false,
        inactivePaneOpacity: 0.45,
        isActivePane: false,
        isHoveredPane: false,
      }),
    ).toBe(1);
  });
});
