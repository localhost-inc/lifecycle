import { describe, expect, test } from "bun:test";
import {
  DEFAULT_INTERFACE_FONT_FAMILY,
  DEFAULT_MONOSPACE_FONT_FAMILY,
} from "@/lib/typography";
import { buildDefaultHarnessSettings } from "@/features/settings/state/harness-settings";

import {
  DEFAULT_BASE_FONT_SIZE,
  DEFAULT_INACTIVE_PANE_OPACITY,
  applyFontSettings,
  parseSettingsJson,
} from "@/features/settings/state/settings-provider";

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
        baseFontSize: 16,
        interfaceFontFamily: '"Geist", system-ui, sans-serif',
        monospaceFontFamily: '"Geist Mono", ui-monospace, monospace',
      },
      root,
    );

    expect(properties.get("font-size")).toBe("16px");
    expect(properties.get("--font-heading")).toBe('"Geist", system-ui, sans-serif');
    expect(properties.get("--font-body")).toBe('"Geist", system-ui, sans-serif');
    expect(properties.get("--font-mono")).toBe('"Geist Mono", ui-monospace, monospace');
  });
});

describe("parseSettingsJson", () => {
  test("returns defaults when config is empty", () => {
    expect(parseSettingsJson(null)).toEqual({
      baseFontSize: DEFAULT_BASE_FONT_SIZE,
      theme: "dark",
      defaultNewTabLaunch: "shell",
      dimInactivePanes: false,
      harnesses: buildDefaultHarnessSettings(),
      interfaceFontFamily: DEFAULT_INTERFACE_FONT_FAMILY,
      inactivePaneOpacity: DEFAULT_INACTIVE_PANE_OPACITY,
      monospaceFontFamily: DEFAULT_MONOSPACE_FONT_FAMILY,
      turnNotificationSound: "orbit",
      turnNotificationsMode: "when-unfocused",
      worktreeRoot: "~/.lifecycle/worktrees",
    });
  });

  test("keeps valid settings and normalizes invalid ones", () => {
    expect(
      parseSettingsJson({
        theme: "catppuccin",
        dimInactivePanes: true,
        harnesses: {
          claude: {
            dangerousSkipPermissions: true,
            effort: "default",
            model: "default",
            permissionMode: "bypassPermissions",
            preset: "trusted_host",
          },
          codex: {
            approvalPolicy: "never",
            dangerousBypass: true,
            model: "gpt-5.4",
            preset: "trusted_host",
            reasoningEffort: "default",
            sandboxMode: "danger-full-access",
          },
        },
        inactivePaneOpacity: 0.45,
        turnNotificationSound: "signal",
        turnNotificationsMode: "always",
        worktreeRoot: "  ~/workspace-root  ",
      }),
    ).toEqual({
      baseFontSize: DEFAULT_BASE_FONT_SIZE,
      theme: "catppuccin",
      defaultNewTabLaunch: "shell",
      dimInactivePanes: true,
      harnesses: {
        claude: {
          dangerousSkipPermissions: true,
          effort: "default",
          loginMethod: "claudeai",
          model: "default",
          permissionMode: "bypassPermissions",
          preset: "trusted_host",
        },
        codex: {
          approvalPolicy: "never",
          dangerousBypass: true,
          model: "gpt-5.4",
          preset: "trusted_host",
          reasoningEffort: "default",
          sandboxMode: "danger-full-access",
        },
      },
      interfaceFontFamily: DEFAULT_INTERFACE_FONT_FAMILY,
      inactivePaneOpacity: 0.45,
      monospaceFontFamily: DEFAULT_MONOSPACE_FONT_FAMILY,
      turnNotificationSound: "signal",
      turnNotificationsMode: "always",
      worktreeRoot: "~/workspace-root",
    });

    expect(
      parseSettingsJson({
        theme: "broken",
        dimInactivePanes: "broken",
        harnesses: {
          claude: {
            dangerousSkipPermissions: "broken",
            permissionMode: "broken",
          },
          codex: {
            approvalPolicy: "broken",
            dangerousBypass: "broken",
            sandboxMode: "broken",
          },
        },
        inactivePaneOpacity: 0.62,
        turnNotificationSound: "broken",
        turnNotificationsMode: "broken",
      }),
    ).toEqual({
      baseFontSize: DEFAULT_BASE_FONT_SIZE,
      theme: "dark",
      defaultNewTabLaunch: "shell",
      dimInactivePanes: false,
      harnesses: buildDefaultHarnessSettings(),
      interfaceFontFamily: DEFAULT_INTERFACE_FONT_FAMILY,
      inactivePaneOpacity: DEFAULT_INACTIVE_PANE_OPACITY,
      monospaceFontFamily: DEFAULT_MONOSPACE_FONT_FAMILY,
      turnNotificationSound: "orbit",
      turnNotificationsMode: "when-unfocused",
      worktreeRoot: "~/.lifecycle/worktrees",
    });
  });
});
