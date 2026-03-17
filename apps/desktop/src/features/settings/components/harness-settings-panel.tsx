import { Tabs, TabsContent, TabsList, TabsTrigger } from "@lifecycle/ui";
import { type ClaudeHarnessSettings, type CodexHarnessSettings } from "../state/harness-settings";
import { ClaudeHarnessSettingsContent } from "./harnesses/claude-harness-settings-card";
import { CodexHarnessSettingsContent } from "./harnesses/codex-harness-settings-card";

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
    <Tabs defaultValue="codex">
      <TabsList variant="pill">
        <TabsTrigger value="codex" variant="pill">
          Codex
        </TabsTrigger>
        <TabsTrigger value="claude" variant="pill">
          Claude
        </TabsTrigger>
      </TabsList>
      <TabsContent className="pt-4" value="codex">
        <CodexHarnessSettingsContent
          defaultAdvancedOpen={defaultCodexAdvancedOpen}
          onChange={onCodexChange}
          settings={codex}
        />
      </TabsContent>
      <TabsContent className="pt-4" value="claude">
        <ClaudeHarnessSettingsContent
          defaultAdvancedOpen={defaultClaudeAdvancedOpen}
          onChange={onClaudeChange}
          settings={claude}
        />
      </TabsContent>
    </Tabs>
  );
}
