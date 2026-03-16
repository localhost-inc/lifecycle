import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useContext, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CommandPaletteContext } from "../features/command-palette/command-palette-context";
import {
  isMacPlatform,
  shouldHandleDomAppHotkey,
  subscribeToAppHotkeyEvents,
  type AppHotkeyAction,
} from "./app-hotkeys";
import { SHORTCUT_HANDLER_PRIORITY, useShortcutRegistration } from "./shortcuts/shortcut-router";

export function AppHotkeyListener() {
  const location = useLocation();
  const navigate = useNavigate();
  const tauriApp = isTauri();
  const macPlatform = isMacPlatform();
  const commandPalette = useContext(CommandPaletteContext);

  const handleAction = useCallback(
    (action: AppHotkeyAction) => {
      switch (action) {
        case "open-settings":
          if (location.pathname !== "/settings") {
            void navigate("/settings");
          }
          return;
        case "open-command-palette":
          commandPalette?.toggle("commands");
          return;
        case "open-file-picker":
          if (commandPalette?.canOpenFiles) {
            commandPalette.toggle("files");
          }
          return;
      }
    },
    [commandPalette, location.pathname, navigate],
  );

  useShortcutRegistration({
    enabled: shouldHandleDomAppHotkey("open-settings", {
      isTauriApp: tauriApp,
      macPlatform,
    }),
    handler: () => {
      handleAction("open-settings");
    },
    id: "app.open-settings",
    priority: SHORTCUT_HANDLER_PRIORITY.app,
  });

  useShortcutRegistration({
    enabled: shouldHandleDomAppHotkey("open-command-palette", {
      isTauriApp: tauriApp,
      macPlatform,
    }),
    handler: () => {
      handleAction("open-command-palette");
    },
    id: "app.open-command-palette",
    priority: SHORTCUT_HANDLER_PRIORITY.app,
  });

  useShortcutRegistration({
    enabled: shouldHandleDomAppHotkey("open-file-picker", {
      isTauriApp: tauriApp,
      macPlatform,
    }),
    handler: () => {
      handleAction("open-file-picker");
    },
    id: "app.open-file-picker",
    priority: SHORTCUT_HANDLER_PRIORITY.app,
  });

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void subscribeToAppHotkeyEvents((event) => {
      if (!disposed) {
        handleAction(event.action);
      }
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }

      unlisten = cleanup;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [handleAction]);

  return null;
}
