import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useContext, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CommandPaletteContext } from "../features/command-palette/command-palette-context";
import {
  shouldHandleDomAppHotkey,
  isEditableTarget,
  isMacPlatform,
  readAppHotkeyAction,
  subscribeToAppHotkeyEvents,
  type AppHotkeyAction,
} from "./app-hotkeys";

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return;
      }

      const action = readAppHotkeyAction(event, macPlatform);
      if (
        !action ||
        !shouldHandleDomAppHotkey(action, {
          isTauriApp: tauriApp,
          macPlatform,
        })
      ) {
        return;
      }

      event.preventDefault();
      handleAction(action);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleAction, macPlatform, tauriApp]);

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
