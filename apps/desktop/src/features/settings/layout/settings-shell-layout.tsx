import { isTauri } from "@tauri-apps/api/core";
import {
  Button,
  Input,
  ScrollFade,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  sidebarMenuSubButtonVariants,
  themeOptions,
  useTheme,
  type Theme,
} from "@lifecycle/ui";
import { Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { version } from "../../../../package.json";
import { AppHotkeyListener } from "../../../app/app-hotkey-listener";
import {
  detectPlatformHint,
  shouldInsetForWindowControls,
} from "../../../components/layout/window-controls";
import { getInterfaceFontPresets, getMonospaceFontPresets } from "../../../lib/typography";
import { AuthSessionSettingsPanel } from "../../auth/components/auth-session-settings-panel";
import { useAuthSession } from "../../auth/state/auth-session-provider";
import {
  turnNotificationModeOptions,
  turnNotificationSoundOptions,
  type TurnNotificationMode,
  type TurnNotificationSound,
} from "../../notifications/lib/notification-settings";
import {
  playTurnNotificationSound,
  warmAudioContext,
} from "../../notifications/lib/turn-notification-runtime";
import { SettingsFieldRow, SettingsRow, SettingsSection } from "../components/settings-primitives";
import { DEFAULT_WORKTREE_ROOT, useSettings } from "../state/app-settings-provider";
import {
  readSettingsSectionHash,
  settingsSections,
  type SettingsSectionSlug,
} from "../state/settings-sections";

const ACTIVE_SECTION_OFFSET = 112;

export function SettingsShellLayout() {
  const tauriApp = isTauri();
  const shouldInset = shouldInsetForWindowControls(detectPlatformHint(), tauriApp);
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, resolvedAppearance, setTheme } = useTheme();
  const {
    isLoading: authSessionLoading,
    refresh: refreshAuthSession,
    session: authSession,
  } = useAuthSession();
  const {
    interfaceFontFamily,
    monospaceFontFamily,
    resetTypography,
    setInterfaceFontFamily,
    setMonospaceFontFamily,
    setTurnNotificationSound,
    setTurnNotificationsMode,
    setWorktreeRoot,
    turnNotificationSound,
    turnNotificationsMode,
    worktreeRoot,
  } = useSettings();
  const [draftWorktreeRoot, setDraftWorktreeRoot] = useState(worktreeRoot);
  const [activeSection, setActiveSection] = useState<SettingsSectionSlug>(
    readSettingsSectionHash(location.hash) ?? settingsSections[0].slug,
  );
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Partial<Record<SettingsSectionSlug, HTMLElement | null>>>({});
  const themeItems = useMemo(
    () =>
      themeOptions.map((option) => ({
        label: option.label,
        value: option.value,
      })),
    [],
  );
  const turnNotificationModeItems = useMemo(
    () =>
      turnNotificationModeOptions.map((option) => ({
        label: option.label,
        value: option.value,
      })),
    [],
  );
  const turnNotificationSoundItems = useMemo(
    () =>
      turnNotificationSoundOptions.map((option) => ({
        label: option.label,
        value: option.value,
      })),
    [],
  );
  const interfaceFontPresets = useMemo(() => getInterfaceFontPresets(), []);
  const monospaceFontPresets = useMemo(() => getMonospaceFontPresets(), []);
  const selectedTurnNotificationMode =
    turnNotificationModeOptions.find((option) => option.value === turnNotificationsMode) ?? null;
  const selectedTurnNotificationSound =
    turnNotificationSoundOptions.find((option) => option.value === turnNotificationSound) ?? null;
  const selectedInterfacePresetId =
    interfaceFontPresets.find((preset) => preset.fontFamily === interfaceFontFamily)?.id ??
    "custom";
  const selectedInterfacePreset =
    interfaceFontPresets.find((preset) => preset.id === selectedInterfacePresetId) ?? null;
  const interfaceFontPresetItems = useMemo(
    () => [
      ...interfaceFontPresets.map((preset) => ({
        label: preset.label,
        value: preset.id,
      })),
      ...(selectedInterfacePresetId === "custom" ? [{ label: "Custom", value: "custom" }] : []),
    ],
    [interfaceFontPresets, selectedInterfacePresetId],
  );
  const selectedMonospacePresetId =
    monospaceFontPresets.find((preset) => preset.fontFamily === monospaceFontFamily)?.id ??
    "custom";
  const selectedMonospacePreset =
    monospaceFontPresets.find((preset) => preset.id === selectedMonospacePresetId) ?? null;
  const monospaceFontPresetItems = useMemo(
    () => [
      ...monospaceFontPresets.map((preset) => ({
        label: preset.label,
        value: preset.id,
      })),
      ...(selectedMonospacePresetId === "custom" ? [{ label: "Custom", value: "custom" }] : []),
    ],
    [monospaceFontPresets, selectedMonospacePresetId],
  );
  const normalizedDraftWorktreeRoot = draftWorktreeRoot.trim();
  const hasWorktreeRootChanges =
    normalizedDraftWorktreeRoot.length > 0 && normalizedDraftWorktreeRoot !== worktreeRoot;
  const previewPath = useMemo(() => {
    const root =
      normalizedDraftWorktreeRoot.length > 0 ? normalizedDraftWorktreeRoot : worktreeRoot;
    return `${root}/sydney--2c1b1211`;
  }, [normalizedDraftWorktreeRoot, worktreeRoot]);
  const authSessionEnvironmentLabel = useMemo(() => {
    if (import.meta.env.DEV) {
      return tauriApp ? "Vite dev bridge in desktop" : "Vite dev bridge in browser";
    }

    return tauriApp ? "Desktop control plane" : "Browser fallback";
  }, [tauriApp]);

  useEffect(() => {
    setDraftWorktreeRoot(worktreeRoot);
  }, [worktreeRoot]);

  const syncActiveSection = useCallback(() => {
    const root = scrollContainerRef.current;
    if (!root) {
      return;
    }

    const rootTop = root.getBoundingClientRect().top;
    let nextSection: SettingsSectionSlug = settingsSections[0].slug;

    for (const section of settingsSections) {
      const node = sectionRefs.current[section.slug];
      if (!node) {
        continue;
      }

      const sectionTop = node.getBoundingClientRect().top - rootTop;
      if (sectionTop <= ACTIVE_SECTION_OFFSET) {
        nextSection = section.slug;
        continue;
      }

      break;
    }

    setActiveSection((current) => (current === nextSection ? current : nextSection));
  }, []);

  const scrollToSection = useCallback((slug: SettingsSectionSlug, behavior: ScrollBehavior) => {
    const node = sectionRefs.current[slug];
    if (!node) {
      return;
    }

    node.scrollIntoView({
      behavior,
      block: "start",
    });
    setActiveSection((current) => (current === slug ? current : slug));
  }, []);

  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root) {
      return;
    }

    syncActiveSection();
    root.addEventListener("scroll", syncActiveSection, { passive: true });
    window.addEventListener("resize", syncActiveSection);

    return () => {
      root.removeEventListener("scroll", syncActiveSection);
      window.removeEventListener("resize", syncActiveSection);
    };
  }, [syncActiveSection]);

  useEffect(() => {
    const sectionFromHash = readSettingsSectionHash(location.hash);
    if (!sectionFromHash) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollToSection(sectionFromHash, "auto");
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [location.hash, scrollToSection]);

  const handleSelectSection = useCallback(
    (slug: SettingsSectionSlug) => {
      scrollToSection(slug, "smooth");

      if (location.hash !== `#${slug}`) {
        void navigate(
          {
            pathname: location.pathname,
            hash: `#${slug}`,
          },
          { replace: true },
        );
      }
    },
    [location.hash, location.pathname, navigate, scrollToSection],
  );

  return (
    <div className="flex h-full w-full bg-[var(--background)] text-[var(--foreground)]">
      <AppHotkeyListener />

      <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
        <div className={shouldInset ? "px-3 pb-2 pt-11" : "px-3 py-2"} data-tauri-drag-region>
          <Button asChild className="w-full justify-start px-2" variant="ghost">
            <NavLink to="/">
              <span aria-hidden>←</span>
              <span>Back to app</span>
            </NavLink>
          </Button>
        </div>

        <div className="px-4 pb-3 pt-4">
          <p className="text-sm font-semibold text-[var(--foreground)]">Settings</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          <ul className="space-y-0.5">
            {settingsSections.map((section) => (
              <li key={section.slug}>
                <div className="relative">
                  {activeSection === section.slug ? (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-1 left-[-10px] top-0 w-0.5 rounded-full bg-[var(--primary)]"
                    />
                  ) : null}
                  <button
                    className={cn(
                      sidebarMenuSubButtonVariants({ active: false }),
                      "bg-transparent pl-3 pr-2",
                      activeSection === section.slug
                        ? "font-medium text-[var(--foreground)] hover:bg-transparent hover:text-[var(--foreground)]"
                        : "text-[var(--muted-foreground)] hover:bg-transparent hover:text-[var(--foreground)]",
                    )}
                    onClick={() => handleSelectSection(section.slug)}
                    type="button"
                  >
                    <span className="text-sm">{section.label}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </nav>

        <div className="px-4 py-3">
          <p className="text-[11px] text-[var(--muted-foreground)]">v{version}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex min-h-0 flex-1">
          <div className="min-h-0 flex-1 overflow-y-auto" ref={scrollContainerRef}>
            <ScrollFade
              aria-hidden="true"
              className="sticky top-0 z-10 -mb-11 h-11"
              data-tauri-drag-region
              direction="top"
              size={44}
            />
            <div className="px-6 pb-8 pt-14 md:px-12 md:pb-10 md:pt-16">
              <div className="mx-auto w-full max-w-3xl">
                <header>
                  <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
                    Settings
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)]">
                    Account state, appearance, notifications, and workspace defaults.
                  </p>
                </header>

                <SettingsSection
                  description="Visualize the active account, where lifecycle resolved it from, and the runtime path currently driving auth."
                  id="account"
                  label="Account"
                  ref={(node) => {
                    sectionRefs.current.account = node;
                  }}
                >
                  <AuthSessionSettingsPanel
                    environmentLabel={authSessionEnvironmentLabel}
                    isLoading={authSessionLoading}
                    onRefresh={() => {
                      void refreshAuthSession();
                    }}
                    session={authSession}
                  />
                </SettingsSection>

                <SettingsSection
                  id="appearance"
                  label="Appearance"
                  ref={(node) => {
                    sectionRefs.current.appearance = node;
                  }}
                >
                  <div className="space-y-3">
                    <SettingsRow
                      label="Theme"
                      description={
                        theme === "system"
                          ? `Following the system appearance (${resolvedAppearance}).`
                          : "Theme preset for the app shell and code surfaces."
                      }
                    >
                      <Select
                        items={themeItems}
                        onValueChange={(value: string) => setTheme(value as Theme)}
                        value={theme}
                      >
                        <SelectTrigger className="w-full min-w-0 md:w-48" id="theme-select">
                          <SelectValue placeholder="Select a theme" />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          {themeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </SettingsRow>

                    <SettingsRow
                      label="Interface font"
                      description={
                        selectedInterfacePreset?.description ??
                        "Using a custom app font-family stack."
                      }
                    >
                      <Select
                        items={interfaceFontPresetItems}
                        onValueChange={(value: string) => {
                          const preset = interfaceFontPresets.find((item) => item.id === value);
                          if (preset) {
                            setInterfaceFontFamily(preset.fontFamily);
                          }
                        }}
                        value={selectedInterfacePresetId}
                      >
                        <SelectTrigger
                          className="w-full min-w-0 md:w-48"
                          id="interface-font-preset"
                        >
                          <SelectValue placeholder="Select a preset" />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          {interfaceFontPresets.map((preset) => (
                            <SelectItem key={preset.id} value={preset.id}>
                              {preset.label}
                            </SelectItem>
                          ))}
                          {selectedInterfacePresetId === "custom" ? (
                            <SelectItem value="custom">Custom</SelectItem>
                          ) : null}
                        </SelectContent>
                      </Select>
                    </SettingsRow>

                    <SettingsRow
                      label="Monospace font"
                      description={
                        selectedMonospacePreset?.description ??
                        "Using a custom monospace font-family stack."
                      }
                    >
                      <Select
                        items={monospaceFontPresetItems}
                        onValueChange={(value: string) => {
                          const preset = monospaceFontPresets.find((item) => item.id === value);
                          if (preset) {
                            setMonospaceFontFamily(preset.fontFamily);
                          }
                        }}
                        value={selectedMonospacePresetId}
                      >
                        <SelectTrigger
                          className="w-full min-w-0 md:w-48"
                          id="monospace-font-preset"
                        >
                          <SelectValue placeholder="Select a preset" />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          {monospaceFontPresets.map((preset) => (
                            <SelectItem key={preset.id} value={preset.id}>
                              {preset.label}
                            </SelectItem>
                          ))}
                          {selectedMonospacePresetId === "custom" ? (
                            <SelectItem value="custom">Custom</SelectItem>
                          ) : null}
                        </SelectContent>
                      </Select>
                    </SettingsRow>

                    <div className="space-y-3 border-l-4 border-[var(--border)] pl-4">
                      <p className="app-panel-title text-[var(--muted-foreground)]">Preview</p>
                      <p
                        className="text-sm text-[var(--foreground)]"
                        style={{ fontFamily: interfaceFontFamily }}
                      >
                        Workspace state stays readable when interface typography is calm and direct.
                      </p>
                      <p
                        className="text-xs text-[var(--foreground)]"
                        style={{ fontFamily: monospaceFontFamily }}
                      >
                        lifecycle open workspace --id sydney--2c1b1211
                      </p>
                    </div>

                    <div className="pt-2">
                      <Button onClick={resetTypography} variant="outline">
                        Reset to default
                      </Button>
                    </div>
                  </div>
                </SettingsSection>

                <SettingsSection
                  id="notifications"
                  label="Notifications"
                  ref={(node) => {
                    sectionRefs.current.notifications = node;
                  }}
                >
                  <div className="space-y-3">
                    <SettingsRow
                      label="Turn completion"
                      description={
                        selectedTurnNotificationMode?.description ??
                        "Desktop notifications for completed harness turns."
                      }
                    >
                      <Select
                        items={turnNotificationModeItems}
                        onValueChange={(value: string) =>
                          setTurnNotificationsMode(value as TurnNotificationMode)
                        }
                        value={turnNotificationsMode}
                      >
                        <SelectTrigger
                          className="w-full min-w-0 md:w-48"
                          id="turn-notification-mode"
                        >
                          <SelectValue placeholder="Select a notification mode" />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          {turnNotificationModeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </SettingsRow>

                    <SettingsRow
                      label="Notification sound"
                      description={
                        selectedTurnNotificationSound?.description ??
                        "Choose the sound that plays when a turn completes."
                      }
                    >
                      <div className="flex items-center gap-2">
                        <button
                          aria-label="Play preview"
                          className="shrink-0 rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] disabled:pointer-events-none disabled:opacity-40"
                          disabled={turnNotificationSound === "silent"}
                          onClick={() => {
                            void playTurnNotificationSound(turnNotificationSound);
                          }}
                          onPointerDown={warmAudioContext}
                          type="button"
                        >
                          <Volume2 className="size-4" />
                        </button>
                        <Select
                          items={turnNotificationSoundItems}
                          onValueChange={(value: string) =>
                            setTurnNotificationSound(value as TurnNotificationSound)
                          }
                          value={turnNotificationSound}
                        >
                          <SelectTrigger
                            className="w-full min-w-0 md:w-48"
                            id="turn-notification-sound"
                          >
                            <SelectValue placeholder="Select a notification sound" />
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false}>
                            {turnNotificationSoundOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </SettingsRow>

                    <div className="space-y-3 border-l-4 border-[var(--border)] pl-4">
                      <p className="app-panel-title text-[var(--muted-foreground)]">Notes</p>
                      <p className="text-sm text-[var(--foreground)]">
                        Notifications trigger when Claude or Codex finish a turn. Lifecycle may ask
                        for system notification permission the first time one fires.
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Tab response indicators still work even when desktop notifications are off.
                      </p>
                    </div>
                  </div>
                </SettingsSection>

                <SettingsSection
                  id="worktrees"
                  label="Worktrees"
                  ref={(node) => {
                    sectionRefs.current.worktrees = node;
                  }}
                >
                  <SettingsFieldRow
                    label="Worktree root path"
                    htmlFor="worktree-root"
                    description="Supports ~. Existing workspaces stay where they are; this applies to new workspaces only."
                  >
                    <Input
                      id="worktree-root"
                      onChange={(event) => setDraftWorktreeRoot(event.target.value)}
                      placeholder={DEFAULT_WORKTREE_ROOT}
                      value={draftWorktreeRoot}
                    />
                  </SettingsFieldRow>

                  <div className="mt-4 space-y-3 border-l-4 border-[var(--border)] pl-4">
                    <p className="app-panel-title text-[var(--muted-foreground)]">Preview</p>
                    <p className="break-all font-mono text-xs text-[var(--foreground)]">
                      {previewPath}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      disabled={!hasWorktreeRootChanges}
                      onClick={() => setWorktreeRoot(normalizedDraftWorktreeRoot)}
                    >
                      Save
                    </Button>
                    <Button
                      onClick={() => {
                        setDraftWorktreeRoot(DEFAULT_WORKTREE_ROOT);
                        setWorktreeRoot(DEFAULT_WORKTREE_ROOT);
                      }}
                      variant="outline"
                    >
                      Reset to default
                    </Button>
                  </div>
                </SettingsSection>
              </div>
            </div>
            <ScrollFade
              aria-hidden="true"
              className="sticky bottom-0 z-10 -mt-11 h-11"
              direction="bottom"
              size={44}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
