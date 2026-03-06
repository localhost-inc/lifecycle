import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { SettingsProvider } from "./features/settings/state/app-settings-provider";
import { StoreProvider } from "./store";
import "./main.css";
import { ThemeProvider } from "./theme/theme-provider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <StoreProvider>
        <SettingsProvider>
          <RouterProvider router={router} />
        </SettingsProvider>
      </StoreProvider>
    </ThemeProvider>
  </StrictMode>,
);
