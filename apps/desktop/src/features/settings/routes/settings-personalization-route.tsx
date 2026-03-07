import { useEffect, useMemo, useState } from "react";
import { ThemeSelector } from "../../../components/theme-selector";
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

        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="text-base font-medium text-[var(--foreground)]">Theme</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Choose a preset and appearance mode.
          </p>
          <ThemeSelector />
        </section>

        <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-medium text-[var(--foreground)]">Terminal display</h2>
              <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">
                Ghostty Web currently renders terminals through its own canvas surface. Font
                family and size apply directly, and Ghostty Web does not expose a matching
                line-height control yet.
              </p>
            </div>
            <button
              type="button"
              onClick={resetTerminalDisplay}
              className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              Reset defaults
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--foreground)]">Engine</span>
              <div className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]">
                Ghostty Web
              </div>
              <span className="text-xs text-[var(--muted-foreground)]">
                The desktop terminal currently renders through Ghostty Web&apos;s canvas surface.
              </span>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--foreground)]">Font preset</span>
              <select
                value={selectedPresetId}
                onChange={(event) => {
                  const preset = fontPresets.find((item) => item.id === event.target.value);
                  if (preset) {
                    setTerminalFontFamily(preset.fontFamily);
                  }
                }}
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--primary)]"
              >
                {fontPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
                <option value="custom">Custom stack</option>
              </select>
              <span className="text-xs text-[var(--muted-foreground)]">
                {selectedPreset?.description ?? "Using a custom font-family stack."}
              </span>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--foreground)]">Font family</span>
              <input
                type="text"
                value={terminalFontFamily}
                onChange={(event) => setTerminalFontFamily(event.target.value)}
                spellCheck={false}
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--primary)]"
              />
              <span className="text-xs text-[var(--muted-foreground)]">
                Comma-separated CSS font-family stack. First family wins if it is installed.
              </span>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--foreground)]">Font size</span>
              <input
                type="number"
                min={TERMINAL_FONT_SIZE_MIN}
                max={TERMINAL_FONT_SIZE_MAX}
                step={1}
                value={terminalFontSize}
                onChange={(event) => setTerminalFontSize(event.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--primary)]"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--foreground)]">Line height</span>
              <input
                disabled
                type="number"
                min={TERMINAL_LINE_HEIGHT_MIN}
                max={TERMINAL_LINE_HEIGHT_MAX}
                step={0.05}
                value={terminalLineHeight}
                onChange={(event) => setTerminalLineHeight(event.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] opacity-60 outline-none transition disabled:cursor-not-allowed"
              />
              <span className="text-xs text-[var(--muted-foreground)]">
                Ghostty Web does not currently expose a line-height setting.
              </span>
            </label>
          </div>

          <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--background)]/60 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-[var(--foreground)]">Diagnostics</h3>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  Last-known runtime details from the most recently initialized terminal surface.
                </p>
              </div>
              <span className="rounded bg-[var(--muted)] px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                {terminalDiagnostics ? "Captured" : "Waiting for active terminal"}
              </span>
            </div>

            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <div className="rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Platform
                </p>
                <p className="mt-1 text-[var(--foreground)]">{diagnostics.platform}</p>
              </div>
              <div className="rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Device pixel ratio
                </p>
                <p className="mt-1 text-[var(--foreground)]">{diagnostics.devicePixelRatio}</p>
              </div>
              <div className="rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Active renderer
                </p>
                <p className="mt-1 text-[var(--foreground)]">{diagnostics.activeRenderer}</p>
              </div>
              <div className="rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Transparency
                </p>
                <p className="mt-1 text-[var(--foreground)]">
                  {diagnostics.allowTransparency ? "Enabled" : "Disabled"}
                </p>
              </div>
              <div className="rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2 md:col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Font stack
                </p>
                <p className="mt-1 break-all text-[var(--foreground)]">
                  {diagnostics.configuredFontFamily}
                </p>
              </div>
              <div className="rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2 md:col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Lifecycle Mono
                </p>
                <p className="mt-1 text-[var(--foreground)]">
                  {diagnostics.bundledFontReady ? "Loaded" : "Not loaded yet"}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
