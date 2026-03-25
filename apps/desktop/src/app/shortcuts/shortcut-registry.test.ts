import { describe, expect, test } from "bun:test";
import {
  formatRegisteredShortcutLabel,
  getRegisteredShortcut,
  listRegisteredShortcutsForScope,
  REGISTERED_SHORTCUTS,
} from "@/app/shortcuts/shortcut-registry";

describe("shortcut registry", () => {
  test("collects the registered shortcuts in one place", () => {
    expect(REGISTERED_SHORTCUTS.map((shortcut) => shortcut.id)).toEqual([
      "app.open-settings",
      "app.open-command-palette",
      "app.open-explorer",
      "project.go-back",
      "project.go-forward",
      "canvas.pane.tab.open",
      "canvas.pane.tab.close",
      "project.select-index",
      "workspace.previous-workspace",
      "workspace.next-workspace",
      "canvas.pane.tab.select.previous",
      "canvas.pane.tab.select.next",
      "canvas.pane.focus",
      "canvas.tab.reopen",
      "canvas.pane.tab.zoom.toggle",
      "file.save",
    ]);
  });

  test("formats labels from the registry for each platform", () => {
    expect(formatRegisteredShortcutLabel("app.open-settings", true)).toBe("Cmd+,");
    expect(formatRegisteredShortcutLabel("canvas.pane.tab.select.next", true)).toBe("Ctrl+Tab");
    expect(formatRegisteredShortcutLabel("canvas.pane.tab.select.next", false)).toBe("Ctrl+Tab");
    expect(formatRegisteredShortcutLabel("file.save", true)).toBe("Cmd+S");
  });

  test("filters shortcuts by scope", () => {
    expect(
      listRegisteredShortcutsForScope("workspace-canvas").map((shortcut) => shortcut.id),
    ).toEqual([
      "canvas.pane.tab.open",
      "canvas.pane.tab.close",
      "canvas.pane.tab.select.previous",
      "canvas.pane.tab.select.next",
      "canvas.pane.focus",
      "canvas.tab.reopen",
      "canvas.pane.tab.zoom.toggle",
    ]);
  });

  test("keeps contextual close behavior documented in the registry", () => {
    expect(getRegisteredShortcut("canvas.pane.tab.close")).toMatchObject({
      mac: "Cmd+W",
      windowsLinux: "Ctrl+W",
    });
    expect(getRegisteredShortcut("canvas.pane.tab.close").notes).toContain("window-close");
  });
});
