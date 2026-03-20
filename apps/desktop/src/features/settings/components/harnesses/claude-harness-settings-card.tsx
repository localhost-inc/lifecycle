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
import { SettingsRow } from "@/features/settings/components/settings-primitives";
import {
  buildClaudeHarnessSettingsFromPreset,
  claudeHarnessSettingsUseCustomValues,
  claudePermissionModeOptions,
  harnessPresetOptions,
  type ClaudeHarnessSettings,
  type HarnessPreset,
} from "@/features/settings/state/harness-settings";

interface ClaudeHarnessSettingsContentProps {
  defaultAdvancedOpen?: boolean;
  settings: ClaudeHarnessSettings;
  onChange: (value: ClaudeHarnessSettings) => void;
}

export function ClaudeHarnessSettingsContent({
  defaultAdvancedOpen,
  settings,
  onChange,
}: ClaudeHarnessSettingsContentProps) {
  const [advancedOpen, setAdvancedOpen] = useState(
    defaultAdvancedOpen ??
      (settings.dangerousSkipPermissions || claudeHarnessSettingsUseCustomValues(settings)),
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted-foreground)]">
        {harnessPresetOptions.find((o) => o.value === settings.preset)?.description ??
          "Choose a preset to configure Claude Code permissions."}
      </p>

      <SettingsRow
        label="Preset"
        description="Applies suggested defaults. Advanced controls below can override them."
      >
        <Select
          items={harnessPresetOptions}
          onValueChange={(value: string) =>
            onChange(buildClaudeHarnessSettingsFromPreset(value as HarnessPreset))
          }
          value={settings.preset}
        >
          <SelectTrigger className="w-full min-w-0 md:w-48" id="claude-harness-preset">
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
            label="Permission mode"
            description="How Claude asks for permission before taking actions."
          >
            <Select
              items={claudePermissionModeOptions}
              onValueChange={(value: string) =>
                onChange({
                  ...settings,
                  permissionMode: value as ClaudeHarnessSettings["permissionMode"],
                })
              }
              value={settings.permissionMode}
            >
              <SelectTrigger className="w-full min-w-0 md:w-48" id="claude-permission-mode">
                <SelectValue placeholder="Select a permission mode" />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {claudePermissionModeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>

          <SettingsRow
            label="Skip all permission checks"
            description="Runs without asking for permission. Only use in environments you fully control."
          >
            <Switch
              aria-label="Skip all permission checks"
              checked={settings.dangerousSkipPermissions}
              id="claude-dangerous-skip-permissions"
              onCheckedChange={(checked) =>
                onChange({
                  ...settings,
                  dangerousSkipPermissions: checked,
                })
              }
            />
          </SettingsRow>
        </div>
      ) : null}

      {settings.dangerousSkipPermissions ? (
        <div className="rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-3 text-sm text-[var(--foreground)]">
          Claude will launch without permission prompts for new sessions on this machine.
        </div>
      ) : null}
    </div>
  );
}
