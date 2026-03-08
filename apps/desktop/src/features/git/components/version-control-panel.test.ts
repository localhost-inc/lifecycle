import { describe, expect, test } from "bun:test";
import {
  getVersionControlTabClassName,
  VERSION_CONTROL_PANEL_BODY_CLASS_NAME,
  VERSION_CONTROL_PANEL_EMPTY_STATE_CLASS_NAME,
  VERSION_CONTROL_PANEL_HEADER_CLASS_NAME,
} from "./version-control-panel";

describe("getVersionControlTabClassName", () => {
  test("uses standard title case styling for active tabs", () => {
    const className = getVersionControlTabClassName(true);

    expect(className).not.toContain("uppercase");
    expect(className).not.toContain("tracking-[0.18em]");
    expect(className).toContain("text-sm");
    expect(className).toContain("px-4");
    expect(className).toContain("py-2");
    expect(className).toContain("bg-[var(--surface-selected)]");
    expect(className).toContain("rounded-[16px]");
  });

  test("uses standard title case styling for inactive tabs", () => {
    const className = getVersionControlTabClassName(false);

    expect(className).not.toContain("uppercase");
    expect(className).not.toContain("tracking-[0.18em]");
    expect(className).toContain("text-sm");
    expect(className).toContain("px-4");
    expect(className).toContain("py-2");
    expect(className).toContain("hover:bg-[var(--surface-hover)]");
    expect(className).toContain("rounded-[16px]");
  });
});

describe("version control panel spacing", () => {
  test("uses the tighter horizontal gutter across panel sections", () => {
    expect(VERSION_CONTROL_PANEL_HEADER_CLASS_NAME).toContain("px-2.5");
    expect(VERSION_CONTROL_PANEL_BODY_CLASS_NAME).toContain("px-2.5");
    expect(VERSION_CONTROL_PANEL_EMPTY_STATE_CLASS_NAME).toContain("px-2.5");
    expect(VERSION_CONTROL_PANEL_HEADER_CLASS_NAME).not.toContain("px-5");
    expect(VERSION_CONTROL_PANEL_BODY_CLASS_NAME).not.toContain("px-5");
    expect(VERSION_CONTROL_PANEL_EMPTY_STATE_CLASS_NAME).not.toContain("px-5");
  });
});
