import { isTauri } from "@tauri-apps/api/core";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { RootErrorBoundary } from "@/app/root-error-boundary";
import { ShortcutRouterProvider } from "@/app/shortcuts/shortcut-router";
import { router } from "@/app/router";
import { AuthSessionProvider } from "@/features/auth/state/auth-session-provider";
import { TurnNotificationListener } from "@/features/notifications/turn-notification-listener";
import { ProjectManifestWatcher } from "@/features/projects/components/project-manifest-watcher";
import { SettingsProvider } from "@/features/settings/state/settings-provider";
import { TerminalResponseReadyProvider } from "@/features/terminals/state/terminal-response-ready-provider";
import { markPerformance, measurePerformance } from "@/lib/performance";
import { QueryProvider } from "@/query";
import "@/main.css";

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
    <RootErrorBoundary>
      <SettingsProvider>
        <BootstrapPerfMarker />
        <ContextMenuBlocker />
        <QueryProvider>
          <AuthSessionProvider>
            <ProjectManifestWatcher />
            <TurnNotificationListener />
            <TerminalResponseReadyProvider>
              <ShortcutRouterProvider>
                <RouterProvider router={router} />
              </ShortcutRouterProvider>
            </TerminalResponseReadyProvider>
          </AuthSessionProvider>
        </QueryProvider>
      </SettingsProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
