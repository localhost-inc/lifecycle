import { ThemeProvider } from "@lifecycle/ui";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { AuthSessionProvider } from "./features/auth/state/auth-session-provider";
import { TurnNotificationListener } from "./features/notifications/turn-notification-listener";
import { OverlayHostBootstrap } from "./features/overlays/overlay-host-bootstrap";
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

markPerformance("bootstrap:start");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider storageKey="lifecycle.desktop.theme">
      <BootstrapPerfMarker />
      <ThemeWindowSync />
      <OverlayHostBootstrap />
      <QueryProvider>
        <AuthSessionProvider>
          <ProjectManifestWatcher />
          <SettingsProvider>
            <TurnNotificationListener />
            <TerminalResponseReadyProvider>
              <RouterProvider router={router} />
            </TerminalResponseReadyProvider>
          </SettingsProvider>
        </AuthSessionProvider>
      </QueryProvider>
    </ThemeProvider>
  </StrictMode>,
);
