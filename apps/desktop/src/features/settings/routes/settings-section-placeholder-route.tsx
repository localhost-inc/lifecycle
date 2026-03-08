import { SettingsPage } from "../components/settings-primitives";

interface SettingsSectionPlaceholderRouteProps {
  title: string;
  description: string;
}

export function SettingsSectionPlaceholderRoute({
  title,
  description,
}: SettingsSectionPlaceholderRouteProps) {
  return (
    <SettingsPage title={title}>
      <p className="mt-6 text-sm text-[var(--muted-foreground)]">{description}</p>
    </SettingsPage>
  );
}
