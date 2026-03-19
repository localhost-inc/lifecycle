import { isTauri } from "@tauri-apps/api/core";
import { ThemeProvider } from "@lifecycle/ui";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { ShortcutRouterProvider } from "./app/shortcuts/shortcut-router";
import { router } from "./app/router";
import { AuthSessionProvider } from "./features/auth/state/auth-session-provider";
import { TurnNotificationListener } from "./features/notifications/turn-notification-listener";
import { ProjectManifestWatcher } from "./features/projects/components/project-manifest-watcher";
import { SettingsProvider } from "./features/settings/state/app-settings-provider";
import { TerminalResponseReadyProvider } from "./features/terminals/state/terminal-response-ready-provider";
import { markPerformance, measurePerformance } from "./lib/performance";
import { QueryProvider } from "./query";
import "./main.css";
import { ThemeWindowSync } from "./theme/theme-window-sync";

function BootstrapPerfMarker() {
  useEffect(() => {
    markPerformance("bootstrap:ready");
    measurePerformance("bootstrap", "bootstrap:start", "bootstrap:ready");
  }, []);

  return null;
}

function ContextMenuBlocker() {
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener("contextmenu", handleContextMenu, true);
    return () => {
      window.removeEventListener("contextmenu", handleContextMenu, true);
    };
  }, []);

  return null;
}

markPerformance("bootstrap:start");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider storageKey="lifecycle.desktop.theme">
      <BootstrapPerfMarker />
      <ContextMenuBlocker />
      <ThemeWindowSync />
      <QueryProvider>
        <AuthSessionProvider>
          <ProjectManifestWatcher />
          <SettingsProvider>
            <TurnNotificationListener />
            <TerminalResponseReadyProvider>
              <ShortcutRouterProvider>
                <RouterProvider router={router} />
              </ShortcutRouterProvider>
            </TerminalResponseReadyProvider>
          </SettingsProvider>
        </AuthSessionProvider>
      </QueryProvider>
    </ThemeProvider>
  </StrictMode>,
);
