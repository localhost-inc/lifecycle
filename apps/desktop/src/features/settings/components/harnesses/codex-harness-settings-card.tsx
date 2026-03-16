import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@lifecycle/ui";
import { useState } from "react";
import { SettingsRow } from "../settings-primitives";
import { HarnessSettingsCardShell } from "./harness-settings-card-shell";
import {
  buildCodexHarnessSettingsFromPreset,
  codexApprovalPolicyOptions,
  codexHarnessSettingsUseCustomValues,
  codexSandboxModeOptions,
  harnessPresetOptions,
  type CodexHarnessSettings,
  type HarnessPreset,
} from "../../state/harness-settings";

interface CodexHarnessSettingsCardProps {
  defaultAdvancedOpen?: boolean;
  settings: CodexHarnessSettings;
  onChange: (value: CodexHarnessSettings) => void;
}

export function CodexHarnessSettingsCard({
  defaultAdvancedOpen,
  settings,
  onChange,
}: CodexHarnessSettingsCardProps) {
  const [advancedOpen, setAdvancedOpen] = useState(
    defaultAdvancedOpen ??
      (settings.dangerousBypass || codexHarnessSettingsUseCustomValues(settings)),
  );

  return (
    <HarnessSettingsCardShell
      description="Configure Codex sandbox and approval defaults for new harness terminals."
      title="Codex"
    >
      <div className="space-y-3">
        <SettingsRow
          label="Preset"
          description="Applies suggested defaults. Advanced controls below can override them."
        >
          <Select
            items={harnessPresetOptions}
            onValueChange={(value: string) =>
              onChange(buildCodexHarnessSettingsFromPreset(value as HarnessPreset))
            }
            value={settings.preset}
          >
            <SelectTrigger className="w-full min-w-0 md:w-48" id="codex-harness-preset">
              <SelectValue placeholder="Select a preset" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {harnessPresetOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>

        <Button
          aria-expanded={advancedOpen}
          className="px-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          onClick={() => setAdvancedOpen((current) => !current)}
          type="button"
          variant="ghost"
        >
          {advancedOpen ? "Hide advanced controls" : "Show advanced controls"}
        </Button>

        {advancedOpen ? (
          <div className="space-y-3 border-l-4 border-[var(--border)] pl-4">
            <SettingsRow
              label="Sandbox mode"
              description="Controls how much filesystem access Codex receives when dangerous bypass is off."
            >
              <Select
                items={codexSandboxModeOptions}
                onValueChange={(value: string) =>
                  onChange({
                    ...settings,
                    sandboxMode: value as CodexHarnessSettings["sandboxMode"],
                  })
                }
                value={settings.sandboxMode}
              >
                <SelectTrigger className="w-full min-w-0 md:w-48" id="codex-sandbox-mode">
                  <SelectValue placeholder="Select a sandbox mode" />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {codexSandboxModeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsRow>

            <SettingsRow
              label="Approval policy"
              description="Controls when Codex pauses for approval while dangerous bypass is off."
            >
              <Select
                items={codexApprovalPolicyOptions}
                onValueChange={(value: string) =>
                  onChange({
                    ...settings,
                    approvalPolicy: value as CodexHarnessSettings["approvalPolicy"],
                  })
                }
                value={settings.approvalPolicy}
              >
                <SelectTrigger className="w-full min-w-0 md:w-48" id="codex-approval-policy">
                  <SelectValue placeholder="Select an approval policy" />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {codexApprovalPolicyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsRow>

            <SettingsRow
              label="Dangerous bypass"
              description="Skips Codex approvals and sandboxing entirely. Use only for workspaces you fully trust."
            >
              <Switch
                aria-label="Enable Codex dangerous bypass"
                checked={settings.dangerousBypass}
                id="codex-dangerous-bypass"
                onCheckedChange={(checked) =>
                  onChange({
                    ...settings,
                    dangerousBypass: checked,
                  })
                }
              />
            </SettingsRow>
          </div>
        ) : null}

        {settings.dangerousBypass ? (
          <div className="rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-3 text-sm text-[var(--foreground)]">
            Codex will launch with full host access and no approval prompts for new sessions.
          </div>
        ) : null}
      </div>
    </HarnessSettingsCardShell>
  );
}
