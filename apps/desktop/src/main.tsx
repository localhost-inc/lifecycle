import { ThemeProvider } from "@lifecycle/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { TurnNotificationListener } from "./features/notifications/turn-notification-listener";
import { OverlayHostBootstrap } from "./features/overlays/overlay-host-bootstrap";
import { ProjectManifestWatcher } from "./features/projects/components/project-manifest-watcher";
import { SettingsProvider } from "./features/settings/state/app-settings-provider";
import { TerminalResponseReadyProvider } from "./features/terminals/state/terminal-response-ready-provider";
import { QueryProvider } from "./query";
import "./main.css";
import { ThemeWindowSync } from "./theme/theme-window-sync";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider storageKey="lifecycle.desktop.theme">
      <ThemeWindowSync />
      <OverlayHostBootstrap />
      <QueryProvider>
        <ProjectManifestWatcher />
        <SettingsProvider>
          <TurnNotificationListener />
          <TerminalResponseReadyProvider>
            <RouterProvider router={router} />
          </TerminalResponseReadyProvider>
        </SettingsProvider>
      </QueryProvider>
    </ThemeProvider>
  </StrictMode>,
);
