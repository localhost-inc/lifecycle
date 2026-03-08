import { ThemeProvider } from "@lifecycle/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { SettingsProvider } from "./features/settings/state/app-settings-provider";
import { TerminalResponseReadyProvider } from "./features/terminals/state/terminal-response-ready-provider";
import { StoreProvider } from "./store";
import "./main.css";
import { ThemeWindowSync } from "./theme/theme-window-sync";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider storageKey="lifecycle.desktop.theme.v1">
      <ThemeWindowSync />
      <StoreProvider>
        <SettingsProvider>
          <TerminalResponseReadyProvider>
            <RouterProvider router={router} />
          </TerminalResponseReadyProvider>
        </SettingsProvider>
      </StoreProvider>
    </ThemeProvider>
  </StrictMode>,
);
