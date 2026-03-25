import { isTauri } from "@tauri-apps/api/core";
import {
  Button,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
  sidebarMenuSubButtonVariants,
  themeOptions,
  type Theme,
} from "@lifecycle/ui";
import { Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { version } from "../../../../package.json";
import { AppHotkeyListener } from "@/app/app-hotkey-listener";
import {
  detectPlatformHint,
  shouldInsetForWindowControls,
} from "@/components/layout/window-controls";
import { getInterfaceFontPresets, getMonospaceFontPresets } from "@/lib/typography";
import { AuthSessionSettingsPanel } from "@/features/auth/components/auth-session-settings-panel";
import { useAuthSession } from "@/features/auth/state/auth-session-provider";
import {
  turnNotificationModeOptions,
  turnNotificationSoundOptions,
  type TurnNotificationMode,
  type TurnNotificationSound,
} from "@/features/notifications/lib/notification-settings";
import {
  playTurnNotificationSound,
  warmAudioContext,
} from "@/features/notifications/lib/turn-notification-runtime";
import { HarnessSettingsPanel } from "@/features/settings/components/harness-settings-panel";
import { ProviderAccountsPanel } from "@/features/settings/components/provider-accounts-panel";
import {
  SettingsFieldRow,
  SettingsRow,
  SettingsSection,
} from "@/features/settings/components/settings-primitives";
import {
  BASE_FONT_SIZE_OPTIONS,
  DEFAULT_WORKTREE_ROOT,
  INACTIVE_PANE_OPACITY_OPTIONS,
  type DefaultNewTabLaunch,
} from "@/features/settings/state/settings-state";
import { useSettings } from "@/features/settings/state/settings-context";
import {
  readSettingsSectionHash,
  settingsSections,
  type SettingsSectionSlug,
} from "@/features/settings/state/settings-sections";

const ACTIVE_SECTION_OFFSET = 112;

export function SettingsShellLayout() {
  const tauriApp = isTauri();
  const shouldInset = shouldInsetForWindowControls(detectPlatformHint(), tauriApp);
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isLoading: authSessionLoading,
    refresh: refreshAuthSession,
    session: authSession,
  } = useAuthSession();
  const {
    baseFontSize,
    theme,
    resolvedAppearance,
    defaultNewTabLaunch,
    dimInactivePanes,
    harnesses,
    interfaceFontFamily,
    inactivePaneOpacity,
    monospaceFontFamily,
    resetTypography,
    setBaseFontSize,
    setClaudeHarnessSettings,
    setCodexHarnessSettings,
    setDefaultNewTabLaunch,
    setDimInactivePanes,
    setInactivePaneOpacity,
    setInterfaceFontFamily,
    setMonospaceFontFamily,
    setTheme,
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
  const baseFontSizeItems = useMemo(
    () =>
      BASE_FONT_SIZE_OPTIONS.map((option) => ({
        label: option.label,
        value: String(option.value),
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
  const defaultNewTabLaunchItems = useMemo(
    () => [
      { label: "Claude", value: "claude" as const },
      { label: "Codex", value: "codex" as const },
    ],
    [],
  );
  const inactivePaneOpacityItems = useMemo(
    () =>
      INACTIVE_PANE_OPACITY_OPTIONS.map((option) => ({
        label: option.label,
        value: option.value.toFixed(2),
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
  useEffect(() => {
    setDraftWorktreeRoot(worktreeRoot);
  }, [worktreeRoot]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }

      event.preventDefault();
      navigate(-1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [navigate]);

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
    <div className="flex h-full w-full bg-[var(--surface)] text-[var(--foreground)]">
      <AppHotkeyListener />

      <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--background)]">
        <div className={shouldInset ? "px-3 pb-2 pt-11" : "px-3 py-2"} data-tauri-drag-region>
          <Button
            className="w-full justify-start px-2"
            onClick={() => navigate(-1)}
            variant="ghost"
          >
            <span aria-hidden>←</span>
            <span>Back to app</span>
          </Button>
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
            <div className="px-6 pb-8 pt-14 md:px-12 md:pb-10 md:pt-16">
              <div className="mx-auto w-full max-w-3xl">
                <header>
                  <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
                    Settings
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)]">
                    Manage your account, appearance, workspace layout, agents, and notifications.
                  </p>
                </header>

                <SettingsSection
                  description="Your signed-in identity and authentication status."
                  id="account"
                  label="Account"
                  ref={(node) => {
                    sectionRefs.current.account = node;
                  }}
                >
                  <AuthSessionSettingsPanel
                    isLoading={authSessionLoading}
                    onRefresh={() => {
                      void refreshAuthSession();
                    }}
                    session={authSession}
                  />
                </SettingsSection>

                <SettingsSection
                  description="Theme, fonts, and visual style for the app."
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
                      label="Base font size"
                      description="Scales the entire interface. All spacing and layout adapts with the font size."
                    >
                      <Select
                        items={baseFontSizeItems}
                        onValueChange={(value: string) => setBaseFontSize(Number(value))}
                        value={String(baseFontSize)}
                      >
                        <SelectTrigger className="w-full min-w-0 md:w-48" id="base-font-size">
                          <SelectValue placeholder="Select a size" />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          {BASE_FONT_SIZE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={String(option.value)}>
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

                    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
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
                  description="Layout, display, and file storage for workspaces."
                  id="workspace"
                  label="Workspace"
                  ref={(node) => {
                    sectionRefs.current.workspace = node;
                  }}
                >
                  <SettingsRow
                    label="Default new tab"
                    description="The session type launched by Cmd+T and the new tab shortcut."
                  >
                    <Select
                      items={defaultNewTabLaunchItems}
                      onValueChange={(value: string) =>
                        setDefaultNewTabLaunch(value as DefaultNewTabLaunch)
                      }
                      value={defaultNewTabLaunch}
                    >
                      <SelectTrigger className="w-full min-w-0 md:w-48" id="default-new-tab-launch">
                        <SelectValue placeholder="Select a default" />
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        {defaultNewTabLaunchItems.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SettingsRow>

                  <SettingsRow
                    label="Dim inactive panes"
                    description="Lower the opacity of non-active pane groups until you hover them."
                  >
                    <Switch
                      aria-label="Dim inactive panes"
                      checked={dimInactivePanes}
                      id="dim-inactive-panes"
                      onCheckedChange={setDimInactivePanes}
                    />
                  </SettingsRow>

                  {dimInactivePanes ? (
                    <div className="pl-4">
                      <SettingsRow
                        label="Inactive opacity"
                        description="Applies to every non-active pane group until it becomes active or hovered."
                      >
                        <Select
                          items={inactivePaneOpacityItems}
                          onValueChange={(value: string) => setInactivePaneOpacity(Number(value))}
                          value={inactivePaneOpacity.toFixed(2)}
                        >
                          <SelectTrigger
                            className="w-full min-w-0 md:w-48"
                            id="inactive-pane-opacity"
                          >
                            <SelectValue placeholder="Select an opacity" />
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false}>
                            {INACTIVE_PANE_OPACITY_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value.toFixed(2)}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </SettingsRow>
                    </div>
                  ) : null}

                  <SettingsFieldRow
                    label="Working copies root"
                    htmlFor="worktree-root"
                    description="Where new workspaces are created on disk. Supports ~. Existing workspaces stay where they are."
                  >
                    <Input
                      id="worktree-root"
                      onChange={(event) => setDraftWorktreeRoot(event.target.value)}
                      placeholder={DEFAULT_WORKTREE_ROOT}
                      value={draftWorktreeRoot}
                    />
                  </SettingsFieldRow>

                  <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
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

                <SettingsSection
                  description="Alerts and sounds when an agent finishes a response."
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
                        "Desktop notifications for completed harness turns. Tab response indicators still work even when desktop notifications are off."
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
                        <IconButton
                          aria-label="Play preview"
                          disabled={turnNotificationSound === "silent"}
                          onClick={() => {
                            void playTurnNotificationSound(turnNotificationSound);
                          }}
                          onPointerDown={warmAudioContext}
                        >
                          <Volume2 className="size-4" />
                        </IconButton>
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
                  </div>
                </SettingsSection>

                <SettingsSection
                  description="Provider accounts, launch defaults, and permissions for Claude and Codex sessions."
                  id="agents"
                  label="Agents"
                  ref={(node) => {
                    sectionRefs.current.agents = node;
                  }}
                >
                  <ProviderAccountsPanel />
                  <div className="mt-6" />
                  <HarnessSettingsPanel
                    claude={harnesses.claude}
                    codex={harnesses.codex}
                    onClaudeChange={setClaudeHarnessSettings}
                    onCodexChange={setCodexHarnessSettings}
                  />
                </SettingsSection>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
