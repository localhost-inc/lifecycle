import { describe, expect, test } from "bun:test";
import { readAppHotkeyAction } from "./app-hotkeys";

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
