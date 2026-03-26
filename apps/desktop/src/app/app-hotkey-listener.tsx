import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useContext, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CommandPaletteContext } from "@/features/command-palette/command-palette-context";
import {
  isMacPlatform,
  shouldHandleDomAppHotkey,
  subscribeToAppHotkeyEvents,
  type AppHotkeyEvent,
} from "@/app/app-hotkeys";
import {
  SHORTCUT_HANDLER_PRIORITY,
  useShortcutRegistration,
} from "@/app/shortcuts/shortcut-router";

interface AppHotkeyListenerProps {
  onSelectProjectIndex?: (index: number) => void;
}

export function AppHotkeyListener({ onSelectProjectIndex }: AppHotkeyListenerProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const tauriApp = isTauri();
  const macPlatform = isMacPlatform();
  const commandPalette = useContext(CommandPaletteContext);

  const handleEvent = useCallback(
    (event: AppHotkeyEvent) => {
      switch (event.action) {
        case "open-settings":
          if (location.pathname !== "/settings") {
            void navigate("/settings");
          }
          return;
        case "open-command-palette":
          commandPalette?.toggle("commands");
          return;
        case "open-explorer":
          if (commandPalette?.canOpenExplorer) {
            commandPalette.toggle("explorer");
          }
          return;
        case "select-project-index":
          if (event.index != null) {
            onSelectProjectIndex?.(event.index);
          }
          return;
      }
    },
    [commandPalette, location.pathname, navigate, onSelectProjectIndex],
  );

  useShortcutRegistration({
    enabled: shouldHandleDomAppHotkey("open-settings", {
      isTauriApp: tauriApp,
      macPlatform,
    }),
    handler: () => {
      handleEvent({ action: "open-settings", index: null, source: "menu" });
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
      handleEvent({ action: "open-command-palette", index: null, source: "menu" });
    },
    id: "app.open-command-palette",
    priority: SHORTCUT_HANDLER_PRIORITY.app,
  });

  useShortcutRegistration({
    enabled: shouldHandleDomAppHotkey("open-explorer", {
      isTauriApp: tauriApp,
      macPlatform,
    }),
    handler: () => {
      handleEvent({ action: "open-explorer", index: null, source: "menu" });
    },
    id: "app.open-explorer",
    priority: SHORTCUT_HANDLER_PRIORITY.app,
  });

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void subscribeToAppHotkeyEvents((event) => {
      if (!disposed) {
        handleEvent(event);
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
  }, [handleEvent]);

  return null;
}
