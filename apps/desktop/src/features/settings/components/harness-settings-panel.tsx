import { type ClaudeHarnessSettings, type CodexHarnessSettings } from "../state/harness-settings";
import { ClaudeHarnessSettingsCard } from "./harnesses/claude-harness-settings-card";
import { CodexHarnessSettingsCard } from "./harnesses/codex-harness-settings-card";

interface HarnessSettingsPanelProps {
  claude: ClaudeHarnessSettings;
  codex: CodexHarnessSettings;
  defaultClaudeAdvancedOpen?: boolean;
  defaultCodexAdvancedOpen?: boolean;
  onClaudeChange: (value: ClaudeHarnessSettings) => void;
  onCodexChange: (value: CodexHarnessSettings) => void;
}

export function HarnessSettingsPanel({
  claude,
  codex,
  defaultClaudeAdvancedOpen,
  defaultCodexAdvancedOpen,
  onClaudeChange,
  onCodexChange,
}: HarnessSettingsPanelProps) {
  return (
    <div className="space-y-4">
      <CodexHarnessSettingsCard
        defaultAdvancedOpen={defaultCodexAdvancedOpen}
        onChange={onCodexChange}
        settings={codex}
      />
      <ClaudeHarnessSettingsCard
        defaultAdvancedOpen={defaultClaudeAdvancedOpen}
        onChange={onClaudeChange}
        settings={claude}
      />
    </div>
  );
}
