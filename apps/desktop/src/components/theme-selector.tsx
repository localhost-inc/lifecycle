import { themeAppearanceOptions, themePresetOptions, type ThemeAppearance } from "@lifecycle/ui";
import { useTheme } from "../theme/theme-provider";

export function ThemeSelector() {
  const { appearance, preset, resolvedAppearance, setAppearance, setPreset } = useTheme();

  return (
    <section className="mt-3 rounded-md border border-[var(--border)] bg-[var(--card)]/70 p-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          Theme
        </p>
        <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
          {resolvedAppearance}
        </span>
      </div>

      <label
        className="mb-1 block text-[11px] text-[var(--muted-foreground)]"
        htmlFor="theme-preset"
      >
        Preset
      </label>
      <select
        id="theme-preset"
        value={preset}
        onChange={(e) => setPreset(e.target.value as typeof preset)}
        className="mb-2 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--foreground)]"
      >
        {themePresetOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label
        className="mb-1 block text-[11px] text-[var(--muted-foreground)]"
        htmlFor="theme-appearance"
      >
        Appearance
      </label>
      <select
        id="theme-appearance"
        value={appearance}
        onChange={(e) => setAppearance(e.target.value as ThemeAppearance)}
        className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--foreground)]"
      >
        {themeAppearanceOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </section>
  );
}
