import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ThemeSelector,
} from "@lifecycle/ui";
import { useEffect, useMemo, useState } from "react";
import {
  LIFECYCLE_MONO_FONT_FAMILY,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_LINE_HEIGHT_MAX,
  TERMINAL_LINE_HEIGHT_MIN,
  getTerminalFontPresets,
  getTerminalPlatform,
  resolveTerminalRenderer,
} from "../../terminals/terminal-display";
import { useSettings } from "../state/app-settings-provider";

export function SettingsPersonalizationRoute() {
  const {
    resetTerminalDisplay,
    setTerminalFontFamily,
    setTerminalFontSize,
    setTerminalLineHeight,
    terminalDiagnostics,
    terminalFontFamily,
    terminalFontSize,
    terminalLineHeight,
    terminalRenderer,
  } = useSettings();
  const [bundledFontReady, setBundledFontReady] = useState(false);
  const fontPresets = useMemo(() => getTerminalFontPresets(), []);
  const selectedPresetId =
    fontPresets.find((preset) => preset.fontFamily === terminalFontFamily)?.id ?? "custom";
  const selectedPreset = fontPresets.find((preset) => preset.id === selectedPresetId) ?? null;
  const resolvedRenderer = resolveTerminalRenderer(terminalRenderer);
  const platform = getTerminalPlatform();

  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) {
      setBundledFontReady(false);
      return;
    }

    let cancelled = false;
    const descriptor = `${terminalFontSize}px "${LIFECYCLE_MONO_FONT_FAMILY}"`;
    const syncBundledFontState = () => {
      if (!cancelled) {
        setBundledFontReady(document.fonts.check(descriptor));
      }
    };

    syncBundledFontState();
    void document.fonts.ready.then(syncBundledFontState);

    return () => {
      cancelled = true;
    };
  }, [terminalFontSize]);

  const diagnostics = terminalDiagnostics ?? {
    activeRenderer: resolvedRenderer,
    allowTransparency: false,
    bundledFontReady,
    configuredFontFamily: terminalFontFamily,
    devicePixelRatio: typeof window === "undefined" ? 1 : window.devicePixelRatio,
    platform,
    requestedRenderer: terminalRenderer,
    resolvedRenderer,
    webglStatus: "not-requested",
  };

  return (
    <div className="flex flex-1 justify-center overflow-y-auto p-8">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
          Personalization
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Customize the look and feel of the app.
        </p>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Theme</CardTitle>
            <CardDescription>Choose a preset and appearance mode.</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeSelector />
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Terminal display</CardTitle>
              <CardDescription className="max-w-2xl">
                Ghostty Web currently renders terminals through its own canvas surface. Font family
                and size apply directly, and Ghostty Web does not expose a matching line-height
                control yet.
              </CardDescription>
            </div>
            <Button onClick={resetTerminalDisplay} variant="outline">
              Reset defaults
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>Engine</Label>
                <div className="border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]">
                  Ghostty Web
                </div>
                <span className="text-xs text-[var(--muted-foreground)]">
                  The desktop terminal currently renders through Ghostty Web&apos;s canvas surface.
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="terminal-font-preset">Font preset</Label>
                <Select
                  onValueChange={(value: string) => {
                    const preset = fontPresets.find((item) => item.id === value);
                    if (preset) {
                      setTerminalFontFamily(preset.fontFamily);
                    }
                  }}
                  value={selectedPresetId}
                >
                  <SelectTrigger id="terminal-font-preset">
                    <SelectValue placeholder="Select a preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {fontPresets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom stack</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {selectedPreset?.description ?? "Using a custom font-family stack."}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="terminal-font-family">Font family</Label>
                <Input
                  id="terminal-font-family"
                  onChange={(event) => setTerminalFontFamily(event.target.value)}
                  spellCheck={false}
                  type="text"
                  value={terminalFontFamily}
                />
                <span className="text-xs text-[var(--muted-foreground)]">
                  Comma-separated CSS font-family stack. First family wins if it is installed.
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="terminal-font-size">Font size</Label>
                <Input
                  id="terminal-font-size"
                  max={TERMINAL_FONT_SIZE_MAX}
                  min={TERMINAL_FONT_SIZE_MIN}
                  onChange={(event) => setTerminalFontSize(event.target.value)}
                  step={1}
                  type="number"
                  value={terminalFontSize}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="terminal-line-height">Line height</Label>
                <Input
                  disabled
                  id="terminal-line-height"
                  max={TERMINAL_LINE_HEIGHT_MAX}
                  min={TERMINAL_LINE_HEIGHT_MIN}
                  onChange={(event) => setTerminalLineHeight(event.target.value)}
                  step={0.05}
                  type="number"
                  value={terminalLineHeight}
                />
                <span className="text-xs text-[var(--muted-foreground)]">
                  Ghostty Web does not currently expose a line-height setting.
                </span>
              </div>
            </div>

            <div className="mt-6 border border-[var(--border)] bg-[var(--background)]/60 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium text-[var(--foreground)]">Diagnostics</h3>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    Last-known runtime details from the most recently initialized terminal surface.
                  </p>
                </div>
                <Badge className="tracking-wide" variant="muted">
                  {terminalDiagnostics ? "Captured" : "Waiting for active terminal"}
                </Badge>
              </div>

              <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <div className="border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Platform
                  </p>
                  <p className="mt-1 text-[var(--foreground)]">{diagnostics.platform}</p>
                </div>
                <div className="border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Device pixel ratio
                  </p>
                  <p className="mt-1 text-[var(--foreground)]">{diagnostics.devicePixelRatio}</p>
                </div>
                <div className="border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Active renderer
                  </p>
                  <p className="mt-1 text-[var(--foreground)]">{diagnostics.activeRenderer}</p>
                </div>
                <div className="border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Transparency
                  </p>
                  <p className="mt-1 text-[var(--foreground)]">
                    {diagnostics.allowTransparency ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <div className="border border-[var(--border)] bg-[var(--card)] px-3 py-2 md:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Font stack
                  </p>
                  <p className="mt-1 break-all text-[var(--foreground)]">
                    {diagnostics.configuredFontFamily}
                  </p>
                </div>
                <div className="border border-[var(--border)] bg-[var(--card)] px-3 py-2 md:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Lifecycle Mono
                  </p>
                  <p className="mt-1 text-[var(--foreground)]">
                    {diagnostics.bundledFontReady ? "Loaded" : "Not loaded yet"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
