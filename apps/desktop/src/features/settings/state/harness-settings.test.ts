import { describe, expect, test } from "bun:test";
import {
  buildClaudeHarnessSettingsFromPreset,
  buildCodexHarnessSettingsFromPreset,
  buildHarnessLaunchConfig,
  claudeHarnessSettingsUseCustomValues,
  codexHarnessSettingsUseCustomValues,
  normalizeHarnessSettings,
} from "@/features/settings/state/harness-settings";

describe("harness settings", () => {
  test("builds guarded defaults from presets", () => {
    expect(buildCodexHarnessSettingsFromPreset("guarded")).toEqual({
      approvalPolicy: "untrusted",
      dangerousBypass: false,
      model: "gpt-5.4",
      preset: "guarded",
      reasoningEffort: "default",
      sandboxMode: "workspace-write",
    });
    expect(buildClaudeHarnessSettingsFromPreset("guarded")).toEqual({
      dangerousSkipPermissions: false,
      effort: "default",
      loginMethod: "claudeai",
      model: "default",
      permissionMode: "acceptEdits",
      preset: "guarded",
    });
  });

  test("normalizes invalid persisted harness settings", () => {
    expect(
      normalizeHarnessSettings({
        claude: {
          dangerousSkipPermissions: "broken",
          permissionMode: "broken",
          preset: "broken",
        },
        codex: {
          approvalPolicy: "broken",
          dangerousBypass: "broken",
          preset: "broken",
          sandboxMode: "broken",
        },
      }),
    ).toEqual({
      claude: {
        dangerousSkipPermissions: false,
        effort: "default",
        loginMethod: "claudeai",
        model: "default",
        permissionMode: "acceptEdits",
        preset: "guarded",
      },
      codex: {
        approvalPolicy: "untrusted",
        dangerousBypass: false,
        model: "gpt-5.4",
        preset: "guarded",
        reasoningEffort: "default",
        sandboxMode: "workspace-write",
      },
    });
  });

  test("detects custom advanced values and builds launch snapshots", () => {
    const codex = {
      ...buildCodexHarnessSettingsFromPreset("guarded"),
      approvalPolicy: "never" as const,
    };
    const claude = {
      ...buildClaudeHarnessSettingsFromPreset("guarded"),
      dangerousSkipPermissions: true,
    };

    expect(codexHarnessSettingsUseCustomValues(codex)).toBeTrue();
    expect(claudeHarnessSettingsUseCustomValues(claude)).toBeTrue();
    expect(buildHarnessLaunchConfig("codex", { claude, codex })).toEqual({
      approvalPolicy: "never",
      dangerousBypass: false,
      model: "gpt-5.4",
      preset: "guarded",
      provider: "codex",
      reasoningEffort: "default",
      sandboxMode: "workspace-write",
    });
    expect(buildHarnessLaunchConfig("claude", { claude, codex })).toEqual({
      dangerousSkipPermissions: true,
      effort: "default",
      loginMethod: "claudeai",
      model: "default",
      permissionMode: "acceptEdits",
      preset: "guarded",
      provider: "claude",
    });
  });
});
