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
import {
  buildCodexHarnessSettingsFromPreset,
  codexApprovalPolicyOptions,
  codexHarnessSettingsUseCustomValues,
  codexSandboxModeOptions,
  harnessPresetOptions,
  type CodexHarnessSettings,
  type HarnessPreset,
} from "../../state/harness-settings";

interface CodexHarnessSettingsContentProps {
  defaultAdvancedOpen?: boolean;
  settings: CodexHarnessSettings;
  onChange: (value: CodexHarnessSettings) => void;
}

export function CodexHarnessSettingsContent({
  defaultAdvancedOpen,
  settings,
  onChange,
}: CodexHarnessSettingsContentProps) {
  const [advancedOpen, setAdvancedOpen] = useState(
    defaultAdvancedOpen ??
      (settings.dangerousBypass || codexHarnessSettingsUseCustomValues(settings)),
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted-foreground)]">
        {harnessPresetOptions.find((o) => o.value === settings.preset)?.description ??
          "Choose a preset to configure Codex sandbox and approvals."}
      </p>

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
        <div className="space-y-3 pl-4">
          <SettingsRow
            label="Sandbox mode"
            description="How much filesystem access Codex gets."
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
            description="When Codex pauses to ask before acting."
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
            label="Skip sandbox and approvals"
            description="Runs with full access and no approval prompts. Only use in environments you fully control."
          >
            <Switch
              aria-label="Skip sandbox and approvals"
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
  );
}
