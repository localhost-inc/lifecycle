import { Tabs, TabsContent, TabsList, TabsTrigger } from "@lifecycle/ui";
import { type ClaudeHarnessSettings, type CodexHarnessSettings } from "@/features/settings/state/harness-settings";
import { ClaudeIcon, CodexIcon } from "@/features/workspaces/surfaces/surface-icons";
import { ClaudeHarnessSettingsContent } from "@/features/settings/components/harnesses/claude-harness-settings-card";
import { CodexHarnessSettingsContent } from "@/features/settings/components/harnesses/codex-harness-settings-card";

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
        <TabsTrigger className="gap-1.5" value="codex" variant="pill">
          <CodexIcon size={12} /> Codex
        </TabsTrigger>
        <TabsTrigger className="gap-1.5" value="claude" variant="pill">
          <ClaudeIcon size={12} /> Claude
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
