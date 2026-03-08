import { Badge } from "@lifecycle/ui";
import { SettingsPage, SettingsRow, SettingsSection } from "../components/settings-primitives";

export function SettingsGeneralRoute() {
  return (
    <SettingsPage title="General">
      <SettingsSection label="Defaults">
        <SettingsRow
          label="Default open destination"
          description="Where files and folders open by default."
        >
          <Badge variant="outline">VS Code</Badge>
        </SettingsRow>

        <SettingsRow label="Language" description="Language for the app UI.">
          <Badge variant="outline">Auto Detect</Badge>
        </SettingsRow>

        <SettingsRow
          label="Thread detail"
          description="Choose how much command output to show in threads."
        >
          <Badge variant="outline">Steps with code commands</Badge>
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  );
}
