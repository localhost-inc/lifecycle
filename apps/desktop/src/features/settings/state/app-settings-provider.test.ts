import { describe, expect, test } from "bun:test";
import {
  DEFAULT_INTERFACE_FONT_FAMILY,
  DEFAULT_MONOSPACE_FONT_FAMILY,
} from "../../../lib/typography";

import { applyFontSettings, parseStoredSettings } from "./app-settings-provider";

describe("applyFontSettings", () => {
  test("writes interface and monospace font tokens to the root style", () => {
    const properties = new Map<string, string>();
    const root = {
      setProperty(name: string, value: string) {
        properties.set(name, value);
      },
    };

    applyFontSettings(
      {
        interfaceFontFamily: '"Geist", system-ui, sans-serif',
        monospaceFontFamily: '"Geist Mono", ui-monospace, monospace',
      },
      root,
    );

    expect(properties.get("--font-heading")).toBe('"Geist", system-ui, sans-serif');
    expect(properties.get("--font-body")).toBe('"Geist", system-ui, sans-serif');
    expect(properties.get("--font-mono")).toBe('"Geist Mono", ui-monospace, monospace');
  });
});

describe("parseStoredSettings", () => {
  test("returns defaults when storage is empty", () => {
    expect(parseStoredSettings(null)).toEqual({
      interfaceFontFamily: DEFAULT_INTERFACE_FONT_FAMILY,
      monospaceFontFamily: DEFAULT_MONOSPACE_FONT_FAMILY,
      turnNotificationSound: "glass",
      turnNotificationsMode: "when-unfocused",
      worktreeRoot: "~/.lifecycle/worktrees",
    });
  });

  test("keeps valid notification settings and normalizes invalid ones", () => {
    expect(
      parseStoredSettings(
        JSON.stringify({
          turnNotificationSound: "signal",
          turnNotificationsMode: "always",
          worktreeRoot: "  ~/workspace-root  ",
        }),
      ),
    ).toEqual({
      interfaceFontFamily: DEFAULT_INTERFACE_FONT_FAMILY,
      monospaceFontFamily: DEFAULT_MONOSPACE_FONT_FAMILY,
      turnNotificationSound: "signal",
      turnNotificationsMode: "always",
      worktreeRoot: "~/workspace-root",
    });

    expect(
      parseStoredSettings(
        JSON.stringify({
          turnNotificationSound: "broken",
          turnNotificationsMode: "broken",
        }),
      ),
    ).toEqual({
      interfaceFontFamily: DEFAULT_INTERFACE_FONT_FAMILY,
      monospaceFontFamily: DEFAULT_MONOSPACE_FONT_FAMILY,
      turnNotificationSound: "glass",
      turnNotificationsMode: "when-unfocused",
      worktreeRoot: "~/.lifecycle/worktrees",
    });
  });
});
