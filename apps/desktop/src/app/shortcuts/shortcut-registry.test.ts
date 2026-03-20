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
      "app.open-file-picker",
      "project.go-back",
      "project.go-forward",
      "workspace.new-tab",
      "workspace.close-active-tab",
      "project.select-index",
      "workspace.previous-workspace",
      "workspace.next-workspace",
      "workspace.previous-tab",
      "workspace.next-tab",
      "workspace.focus-pane",
      "workspace.reopen-closed-tab",
      "workspace.toggle-zoom",
      "file.save",
    ]);
  });

  test("formats labels from the registry for each platform", () => {
    expect(formatRegisteredShortcutLabel("app.open-settings", true)).toBe("Cmd+,");
    expect(formatRegisteredShortcutLabel("workspace.next-tab", true)).toBe("Ctrl+Tab");
    expect(formatRegisteredShortcutLabel("workspace.next-tab", false)).toBe("Ctrl+Tab");
    expect(formatRegisteredShortcutLabel("file.save", true)).toBe("Cmd+S");
  });

  test("filters shortcuts by scope", () => {
    expect(
      listRegisteredShortcutsForScope("workspace-canvas").map((shortcut) => shortcut.id),
    ).toEqual([
      "workspace.new-tab",
      "workspace.close-active-tab",
      "workspace.previous-tab",
      "workspace.next-tab",
      "workspace.focus-pane",
      "workspace.reopen-closed-tab",
      "workspace.toggle-zoom",
    ]);
  });

  test("keeps contextual close behavior documented in the registry", () => {
    expect(getRegisteredShortcut("workspace.close-active-tab")).toMatchObject({
      mac: "Cmd+W",
      windowsLinux: "Ctrl+W",
    });
    expect(getRegisteredShortcut("workspace.close-active-tab").notes).toContain("window-close");
  });
});
