import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import {
  LifecycleSettingsSchema,
  type LifecycleSettings,
  type LifecycleSettingsUpdate,
} from "@lifecycle/contracts";

interface SettingsSnapshot {
  path: string;
  settings: LifecycleSettings;
}

export interface BridgeSettingsEnvelope {
  settings: LifecycleSettings;
  settings_path: string;
}

export async function readBridgeSettings(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<BridgeSettingsEnvelope> {
  const snapshot = await readSettingsSnapshot(environment);
  return settingsEnvelope(snapshot);
}

export async function updateBridgeSettings(
  update: LifecycleSettingsUpdate,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<BridgeSettingsEnvelope> {
  const snapshot = await readSettingsSnapshot(environment);
  const nextSettings = mergeSettingsUpdate(snapshot.settings, update);
  await writeSettingsObject(snapshot.path, nextSettings);
  const nextSnapshot = await readSettingsSnapshot(environment);
  return settingsEnvelope(nextSnapshot);
}

async function readSettingsSnapshot(environment: NodeJS.ProcessEnv): Promise<SettingsSnapshot> {
  const path = lifecycleSettingsPath(environment);
  const raw = await readSettingsObject(path);
  return {
    path,
    settings: LifecycleSettingsSchema.parse(raw),
  };
}

function settingsEnvelope(snapshot: SettingsSnapshot): BridgeSettingsEnvelope {
  return {
    settings: snapshot.settings,
    settings_path: snapshot.path,
  };
}

async function readSettingsObject(path: string): Promise<Record<string, unknown>> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Lifecycle settings must be a JSON object: ${path}`);
    }

    return raw as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function writeSettingsObject(path: string, value: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });

  const payload = JSON.stringify(value, null, 2) + "\n";
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, payload, "utf8");
  await rename(tempPath, path);
}

function lifecycleSettingsPath(environment: NodeJS.ProcessEnv): string {
  return join(lifecycleRootPath(environment), "settings.json");
}

function lifecycleRootPath(environment: NodeJS.ProcessEnv): string {
  const configured = environment.LIFECYCLE_ROOT?.trim();
  if (!configured) {
    return join(homedir(), ".lifecycle");
  }

  if (configured === "~") {
    return homedir();
  }

  if (configured.startsWith("~/")) {
    return join(homedir(), configured.slice(2));
  }

  if (!isAbsolute(configured)) {
    throw new Error(`LIFECYCLE_ROOT must be an absolute path or start with ~/: ${configured}`);
  }

  return configured;
}

function mergeSettingsUpdate(
  current: LifecycleSettings,
  update: LifecycleSettingsUpdate,
): LifecycleSettings {
  const profiles = { ...current.terminal.profiles };
  for (const [profileId, profile] of Object.entries(update.terminal?.profiles ?? {})) {
    if (profile === null) {
      delete profiles[profileId];
    } else {
      profiles[profileId] = profile;
    }
  }

  return LifecycleSettingsSchema.parse({
    appearance: {
      ...current.appearance,
      ...update.appearance,
      fonts: {
        ...current.appearance.fonts,
        ...update.appearance?.fonts,
      },
    },
    developer: {
      ...current.developer,
      ...update.developer,
    },
    providers: {
      claude: {
        ...current.providers.claude,
        ...update.providers?.claude,
      },
    },
    terminal: {
      command: {
        ...current.terminal.command,
        ...update.terminal?.command,
      },
      persistence: {
        ...current.terminal.persistence,
        ...update.terminal?.persistence,
      },
      defaultProfile: update.terminal?.defaultProfile ?? current.terminal.defaultProfile,
      profiles,
    },
  });
}
