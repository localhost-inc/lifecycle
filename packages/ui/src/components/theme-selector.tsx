import { cn } from "../lib/cn";
import { Badge } from "./badge";
import { Label } from "./label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { useTheme } from "../theme/theme-provider";
import { themeAppearanceOptions, themePresetOptions, type ThemeAppearance } from "../theme/presets";

interface ThemeSelectorProps {
  className?: string;
}

export function ThemeSelector({ className }: ThemeSelectorProps) {
  const { appearance, preset, resolvedAppearance, setAppearance, setPreset } = useTheme();

  return (
    <div className={cn("grid gap-3", className)}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Theme
        </p>
        <Badge className="uppercase tracking-[0.18em]" variant="muted">
          {resolvedAppearance}
        </Badge>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="theme-preset">Preset</Label>
        <Select value={preset} onValueChange={(value: string) => setPreset(value as typeof preset)}>
          <SelectTrigger id="theme-preset">
            <SelectValue placeholder="Select a preset" />
          </SelectTrigger>
          <SelectContent>
            {themePresetOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="theme-appearance">Appearance</Label>
        <Select
          value={appearance}
          onValueChange={(value: string) => setAppearance(value as ThemeAppearance)}
        >
          <SelectTrigger id="theme-appearance">
            <SelectValue placeholder="Select an appearance" />
          </SelectTrigger>
          <SelectContent>
            {themeAppearanceOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
