import { invokeTauri } from "@/lib/tauri-error";

type SettingsJson = Record<string, unknown>;

let pendingWrite: ReturnType<typeof setTimeout> | null = null;
let pendingValue: SettingsJson | null = null;

export function readAppSettings(): Promise<SettingsJson> {
  return invokeTauri<SettingsJson>("get_app_config");
}

export function writeAppSettings(settings: SettingsJson): void {
  pendingValue = settings;
  if (pendingWrite !== null) return;
  pendingWrite = setTimeout(() => {
    pendingWrite = null;
    const value = pendingValue;
    pendingValue = null;
    if (value !== null) {
      invokeTauri("write_app_config", { config: value }).catch((error) => {
        console.error("Failed to write settings:", error);
      });
    }
  }, 50);
}
