import {
  Badge,
  Button,
  Input,
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
import {
  SettingsFieldRow,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "../components/settings-primitives";

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
    <SettingsPage
      title="Personalization"
      description="Customize the look and feel of the app."
    >
      <SettingsSection label="Theme">
        <div className="py-4">
          <ThemeSelector />
        </div>
      </SettingsSection>

      <SettingsSection label="Terminal display">
        <SettingsRow label="Engine" description="The desktop terminal currently renders through Ghostty Web's canvas surface.">
          <Badge variant="outline">Ghostty Web</Badge>
        </SettingsRow>

        <SettingsRow
          label="Font preset"
          description={selectedPreset?.description ?? "Using a custom font-family stack."}
        >
          <Select
            onValueChange={(value: string) => {
              const preset = fontPresets.find((item) => item.id === value);
              if (preset) {
                setTerminalFontFamily(preset.fontFamily);
              }
            }}
            value={selectedPresetId}
          >
            <SelectTrigger className="w-48" id="terminal-font-preset">
              <SelectValue placeholder="Select a preset" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {fontPresets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.label}
                </SelectItem>
              ))}
              <SelectItem value="custom">Custom stack</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow label="Font size">
          <Input
            className="w-24"
            id="terminal-font-size"
            max={TERMINAL_FONT_SIZE_MAX}
            min={TERMINAL_FONT_SIZE_MIN}
            onChange={(event) => setTerminalFontSize(event.target.value)}
            step={1}
            type="number"
            value={terminalFontSize}
          />
        </SettingsRow>

        <SettingsRow
          label="Line height"
          description="Ghostty Web does not currently expose a line-height setting."
        >
          <Input
            className="w-24"
            disabled
            id="terminal-line-height"
            max={TERMINAL_LINE_HEIGHT_MAX}
            min={TERMINAL_LINE_HEIGHT_MIN}
            onChange={(event) => setTerminalLineHeight(event.target.value)}
            step={0.05}
            type="number"
            value={terminalLineHeight}
          />
        </SettingsRow>

        <SettingsFieldRow
          label="Font family"
          htmlFor="terminal-font-family"
          description="Comma-separated CSS font-family stack. First family wins if it is installed."
        >
          <Input
            id="terminal-font-family"
            onChange={(event) => setTerminalFontFamily(event.target.value)}
            spellCheck={false}
            type="text"
            value={terminalFontFamily}
          />
        </SettingsFieldRow>

        <div className="pt-4">
          <Button onClick={resetTerminalDisplay} variant="outline">
            Reset defaults
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection label="Diagnostics">
        <div className="py-4">
          <div className="flex items-start justify-between gap-4">
            <p className="text-xs text-[var(--muted-foreground)]">
              Last-known runtime details from the most recently initialized terminal surface.
            </p>
            <Badge className="shrink-0 tracking-wide" variant="muted">
              {terminalDiagnostics ? "Captured" : "Waiting for active terminal"}
            </Badge>
          </div>

          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div className="border border-[var(--border)] bg-[var(--background)]/60 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Platform
              </p>
              <p className="mt-1 text-[var(--foreground)]">{diagnostics.platform}</p>
            </div>
            <div className="border border-[var(--border)] bg-[var(--background)]/60 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Device pixel ratio
              </p>
              <p className="mt-1 text-[var(--foreground)]">{diagnostics.devicePixelRatio}</p>
            </div>
            <div className="border border-[var(--border)] bg-[var(--background)]/60 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Active renderer
              </p>
              <p className="mt-1 text-[var(--foreground)]">{diagnostics.activeRenderer}</p>
            </div>
            <div className="border border-[var(--border)] bg-[var(--background)]/60 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Transparency
              </p>
              <p className="mt-1 text-[var(--foreground)]">
                {diagnostics.allowTransparency ? "Enabled" : "Disabled"}
              </p>
            </div>
            <div className="border border-[var(--border)] bg-[var(--background)]/60 px-3 py-2 md:col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Font stack
              </p>
              <p className="mt-1 break-all text-[var(--foreground)]">
                {diagnostics.configuredFontFamily}
              </p>
            </div>
            <div className="border border-[var(--border)] bg-[var(--background)]/60 px-3 py-2 md:col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Lifecycle Mono
              </p>
              <p className="mt-1 text-[var(--foreground)]">
                {diagnostics.bundledFontReady ? "Loaded" : "Not loaded yet"}
              </p>
            </div>
          </div>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
