import { ThemeProvider } from "@lifecycle/ui";
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildClaudeHarnessSettingsFromPreset,
  buildCodexHarnessSettingsFromPreset,
} from "../state/harness-settings";
import { HarnessSettingsPanel } from "./harness-settings-panel";

describe("HarnessSettingsPanel", () => {
  test("renders provider cards and preset controls", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(HarnessSettingsPanel, {
          claude: buildClaudeHarnessSettingsFromPreset("guarded"),
          codex: buildCodexHarnessSettingsFromPreset("guarded"),
          onClaudeChange: () => {},
          onCodexChange: () => {},
        }),
        defaultPreference: { theme: "light" },
        storageKey: "lifecycle.desktop.theme.test",
      }),
    );

    expect(markup).toContain("Codex");
    expect(markup).toContain("Claude");
    expect(markup).toContain("Show advanced controls");
    expect(markup).toContain("Guarded");
    expect(markup).toContain("codex-harness-preset");
    expect(markup).toContain("claude-harness-preset");
  });

  test("renders advanced warnings when dangerous modes are enabled", () => {
    const markup = renderToStaticMarkup(
      createElement(ThemeProvider, {
        children: createElement(HarnessSettingsPanel, {
          claude: buildClaudeHarnessSettingsFromPreset("trusted_host"),
          codex: buildCodexHarnessSettingsFromPreset("trusted_host"),
          defaultClaudeAdvancedOpen: true,
          defaultCodexAdvancedOpen: true,
          onClaudeChange: () => {},
          onCodexChange: () => {},
        }),
        defaultPreference: { theme: "light" },
        storageKey: "lifecycle.desktop.theme.test",
      }),
    );

    expect(markup).toContain("Sandbox mode");
    expect(markup).toContain("Approval policy");
    expect(markup).toContain("Permission mode");
    expect(markup).toContain("full host access and no approval prompts");
    expect(markup).toContain("launch without permission prompts");
  });
});
