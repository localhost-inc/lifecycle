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
  buildClaudeHarnessSettingsFromPreset,
  claudeHarnessSettingsUseCustomValues,
  claudePermissionModeOptions,
  harnessPresetOptions,
  type ClaudeHarnessSettings,
  type HarnessPreset,
} from "../../state/harness-settings";

interface ClaudeHarnessSettingsCardProps {
  defaultAdvancedOpen?: boolean;
  settings: ClaudeHarnessSettings;
  onChange: (value: ClaudeHarnessSettings) => void;
}

export function ClaudeHarnessSettingsCard({
  defaultAdvancedOpen,
  settings,
  onChange,
}: ClaudeHarnessSettingsCardProps) {
  const [advancedOpen, setAdvancedOpen] = useState(
    defaultAdvancedOpen ??
      (settings.dangerousSkipPermissions || claudeHarnessSettingsUseCustomValues(settings)),
  );

  return (
    <HarnessSettingsCardShell
      description="Configure Claude Code permission defaults for new harness terminals."
      title="Claude"
    >
      <div className="space-y-3">
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
          <div className="space-y-3 border-l-4 border-[var(--border)] pl-4">
            <SettingsRow
              label="Permission mode"
              description="Controls how Claude requests approvals when dangerous skip permissions is off."
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
              label="Dangerous skip permissions"
              description="Skips Claude permission checks entirely. Use only for workspaces you fully trust."
            >
              <Switch
                aria-label="Enable Claude dangerous skip permissions"
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
    </HarnessSettingsCardShell>
  );
}
