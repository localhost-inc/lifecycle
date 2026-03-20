import { ThemeProvider } from "@lifecycle/ui";
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildClaudeHarnessSettingsFromPreset,
  buildCodexHarnessSettingsFromPreset,
} from "@/features/settings/state/harness-settings";
import { HarnessSettingsPanel } from "@/features/settings/components/harness-settings-panel";

function renderPanel(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(ThemeProvider, {
      children: createElement(HarnessSettingsPanel, {
        claude: buildClaudeHarnessSettingsFromPreset("guarded"),
        codex: buildCodexHarnessSettingsFromPreset("guarded"),
        onClaudeChange: () => {},
        onCodexChange: () => {},
        ...overrides,
      } as Parameters<typeof HarnessSettingsPanel>[0]),
      defaultPreference: { theme: "light" },
      storageKey: "lifecycle.desktop.theme.test",
    }),
  );
}

describe("HarnessSettingsPanel", () => {
  test("renders tab triggers and default codex content", () => {
    const markup = renderPanel();

    // Tab triggers for both harnesses
    expect(markup).toContain("Codex");
    expect(markup).toContain("Claude");
    expect(markup).toContain("rounded-full");
    expect(markup).not.toContain("rounded-xl bg-[var(--muted)]");
    expect(markup).not.toContain("border-b border-[var(--border)]");
    // Default tab is codex — its content should render
    expect(markup).toContain("Show advanced controls");
    expect(markup).toContain("Guarded");
    expect(markup).toContain("codex-harness-preset");
  });

  test("renders codex advanced warnings when dangerous bypass is enabled", () => {
    const markup = renderPanel({
      codex: buildCodexHarnessSettingsFromPreset("trusted_host"),
      defaultCodexAdvancedOpen: true,
    });

    expect(markup).toContain("Sandbox mode");
    expect(markup).toContain("Approval policy");
    expect(markup).toContain("full host access and no approval prompts");
  });
});
