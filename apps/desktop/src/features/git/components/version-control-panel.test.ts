import { describe, expect, test } from "bun:test";
import {
  VERSION_CONTROL_PANEL_BODY_CLASS_NAME,
  VERSION_CONTROL_PANEL_EMPTY_STATE_CLASS_NAME,
  VERSION_CONTROL_PANEL_HEADER_CLASS_NAME,
  VERSION_CONTROL_PANEL_TAB_TRIGGER_CLASS_NAME,
} from "./version-control-panel";

describe("version control panel spacing", () => {
  test("uses the tighter horizontal gutter across panel sections", () => {
    expect(VERSION_CONTROL_PANEL_HEADER_CLASS_NAME).toContain("px-2.5");
    expect(VERSION_CONTROL_PANEL_BODY_CLASS_NAME).toContain("px-2.5");
    expect(VERSION_CONTROL_PANEL_EMPTY_STATE_CLASS_NAME).toContain("px-2.5");
    expect(VERSION_CONTROL_PANEL_HEADER_CLASS_NAME).not.toContain("px-5");
    expect(VERSION_CONTROL_PANEL_BODY_CLASS_NAME).not.toContain("px-5");
    expect(VERSION_CONTROL_PANEL_EMPTY_STATE_CLASS_NAME).not.toContain("px-5");
  });

  test("keeps version control tab labels at medium weight", () => {
    expect(VERSION_CONTROL_PANEL_TAB_TRIGGER_CLASS_NAME).toContain("font-medium");
    expect(VERSION_CONTROL_PANEL_TAB_TRIGGER_CLASS_NAME).not.toContain("font-semibold");
  });
});
