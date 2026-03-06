import { ThemeSelector } from "../../../components/theme-selector";

export function SettingsPersonalizationRoute() {
  return (
    <div className="flex flex-1 justify-center overflow-y-auto p-8">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
          Personalization
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Customize the look and feel of the app.
        </p>

        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="text-base font-medium text-[var(--foreground)]">Theme</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Choose a preset and appearance mode.
          </p>
          <ThemeSelector />
        </section>
      </div>
    </div>
  );
}
