import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTheme } from "@lifecycle/ui";
import { useEffect } from "react";

export function ThemeWindowSync() {
  const { resolvedAppearance } = useTheme();

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    void getCurrentWindow()
      .setTheme(resolvedAppearance)
      .catch((error) => {
        console.warn("Failed to sync native window theme:", error);
      });
  }, [resolvedAppearance]);

  return null;
}
