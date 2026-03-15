import { describe, expect, test } from "bun:test";
import { formatAppHotkeyLabel, readAppHotkeyAction, shouldHandleDomAppHotkey } from "./app-hotkeys";

describe("readAppHotkeyAction", () => {
  test("reads Command+Comma on macOS", () => {
    expect(
      readAppHotkeyAction(
        {
          altKey: false,
          code: "Comma",
          ctrlKey: false,
          key: ",",
          metaKey: true,
          shiftKey: false,
        },
        true,
      ),
    ).toBe("open-settings");
  });

  test("reads Control+Comma on non-mac platforms", () => {
    expect(
      readAppHotkeyAction(
        {
          altKey: false,
          code: "Comma",
          ctrlKey: true,
          key: ",",
          metaKey: false,
          shiftKey: false,
        },
        false,
      ),
    ).toBe("open-settings");
  });

  test("reads Command+K as open-command-palette on macOS", () => {
    expect(
      readAppHotkeyAction(
        {
          altKey: false,
          code: "KeyK",
          ctrlKey: false,
          key: "k",
          metaKey: true,
          shiftKey: false,
        },
        true,
      ),
    ).toBe("open-command-palette");
  });

  test("reads Command+P as open-file-picker on macOS", () => {
    expect(
      readAppHotkeyAction(
        {
          altKey: false,
          code: "KeyP",
          ctrlKey: false,
          key: "p",
          metaKey: true,
          shiftKey: false,
        },
        true,
      ),
    ).toBe("open-file-picker");
  });

  test("ignores modified or unrelated keys", () => {
    expect(
      readAppHotkeyAction(
        {
          altKey: true,
          code: "Comma",
          ctrlKey: false,
          key: ",",
          metaKey: true,
          shiftKey: false,
        },
        true,
      ),
    ).toBeNull();

    expect(
      readAppHotkeyAction(
        {
          altKey: false,
          code: "KeyJ",
          ctrlKey: false,
          key: "j",
          metaKey: true,
          shiftKey: false,
        },
        true,
      ),
    ).toBeNull();
  });
});

describe("formatAppHotkeyLabel", () => {
  test("formats command labels with the platform modifier", () => {
    expect(formatAppHotkeyLabel("open-settings", true)).toBe("Cmd+,");
    expect(formatAppHotkeyLabel("open-command-palette", false)).toBe("Ctrl+K");
    expect(formatAppHotkeyLabel("open-file-picker", true)).toBe("Cmd+P");
  });
});

describe("shouldHandleDomAppHotkey", () => {
  test("keeps settings on the native menu path for tauri macOS", () => {
    expect(
      shouldHandleDomAppHotkey("open-settings", {
        isTauriApp: true,
        macPlatform: true,
      }),
    ).toBe(false);
  });

  test("keeps command palette on the native menu path for tauri macOS", () => {
    expect(
      shouldHandleDomAppHotkey("open-command-palette", {
        isTauriApp: true,
        macPlatform: true,
      }),
    ).toBe(false);
  });

  test("keeps file picker on the native menu path for tauri macOS", () => {
    expect(
      shouldHandleDomAppHotkey("open-file-picker", {
        isTauriApp: true,
        macPlatform: true,
      }),
    ).toBe(false);
  });
});
