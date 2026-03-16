export type HarnessPreset = "guarded" | "trusted_host";

export const harnessPresetOptions = [
  { label: "Guarded", value: "guarded" as const },
  { label: "Trusted Host", value: "trusted_host" as const },
] as const;

const validHarnessPresets = new Set<string>(harnessPresetOptions.map((option) => option.value));

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeHarnessPreset(value: unknown): HarnessPreset {
  if (typeof value === "string" && validHarnessPresets.has(value)) {
    return value as HarnessPreset;
  }

  return "guarded";
}
