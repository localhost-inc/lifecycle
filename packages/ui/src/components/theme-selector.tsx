import { cn } from "../lib/cn";
import { Badge } from "./badge";
import { Label } from "./label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { useTheme } from "../theme/theme-provider";
import { themeOptions, type Theme } from "../theme/presets";

interface ThemeSelectorProps {
  className?: string;
}

export function ThemeSelector({ className }: ThemeSelectorProps) {
  const { theme, resolvedAppearance, setTheme } = useTheme();

  return (
    <div className={cn("grid gap-3", className)}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Theme
        </p>
        {theme === "system" && (
          <Badge className="uppercase tracking-[0.18em]" variant="muted">
            {resolvedAppearance}
          </Badge>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="theme-select">Theme</Label>
        <Select value={theme} onValueChange={(value: string) => setTheme(value as Theme)}>
          <SelectTrigger id="theme-select">
            <SelectValue placeholder="Select a theme" />
          </SelectTrigger>
          <SelectContent>
            {themeOptions.map((option) => (
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
