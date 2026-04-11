import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import {
  LifecycleDefaultTerminalProfileItems,
  LifecycleSettingsSchema,
  type LifecycleSettings,
  type LifecycleSettingsUpdate,
} from "@lifecycle/contracts";

interface SettingsSnapshot {
  path: string;
  raw: Record<string, unknown>;
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
  const nextRaw = mergeSettingsUpdate(snapshot.raw, update);
  await writeSettingsObject(snapshot.path, nextRaw);
  const nextSnapshot = await readSettingsSnapshot(environment);
  return settingsEnvelope(nextSnapshot);
}

async function readSettingsSnapshot(environment: NodeJS.ProcessEnv): Promise<SettingsSnapshot> {
  const path = lifecycleSettingsPath(environment);
  const raw = await readSettingsObject(path);
  return {
    path,
    raw,
    settings: normalizeLifecycleSettings(raw),
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

function normalizeLifecycleSettings(raw: Record<string, unknown>): LifecycleSettings {
  return LifecycleSettingsSchema.parse({
    appearance: {
      theme: readAppearanceTheme(raw),
    },
    providers: {
      claude: {
        loginMethod: readClaudeProviderLoginMethod(raw),
      },
    },
    terminal: {
      command: {
        program: readTerminalCommandProgram(raw),
      },
      persistence: {
        backend: readTerminalPersistenceBackend(raw),
        mode: readTerminalPersistenceMode(raw),
        executablePath: readTerminalPersistenceExecutablePath(raw),
      },
      defaultProfile: readTerminalDefaultProfile(raw),
      profiles: readTerminalProfiles(raw),
    },
  });
}

function readAppearanceTheme(raw: Record<string, unknown>): unknown {
  const appearance = asObject(raw.appearance);
  return appearance?.theme ?? raw.theme;
}

function readTerminalCommandProgram(raw: Record<string, unknown>): unknown {
  const terminal = asObject(raw.terminal);
  const command = asObject(terminal?.command);
  const shell = asObject(terminal?.shell);
  return command?.program ?? shell?.program ?? null;
}

function readClaudeProviderLoginMethod(raw: Record<string, unknown>): unknown {
  const providers = asObject(raw.providers);
  const claude = asObject(providers?.claude);
  return claude?.loginMethod ?? "claudeai";
}

function readTerminalPersistenceBackend(raw: Record<string, unknown>): unknown {
  const terminal = asObject(raw.terminal);
  const persistence = asObject(terminal?.persistence);
  if (persistence?.backend !== undefined) {
    return persistence.backend;
  }

  return "tmux";
}

function readTerminalPersistenceMode(raw: Record<string, unknown>): unknown {
  const terminal = asObject(raw.terminal);
  const tmux = asObject(terminal?.tmux);
  const persistence = asObject(terminal?.persistence);
  return persistence?.mode ?? tmux?.mode ?? "managed";
}

function readTerminalPersistenceExecutablePath(raw: Record<string, unknown>): unknown {
  const terminal = asObject(raw.terminal);
  const tmux = asObject(terminal?.tmux);
  const persistence = asObject(terminal?.persistence);
  return persistence?.executablePath ?? tmux?.program ?? null;
}

function readTerminalDefaultProfile(raw: Record<string, unknown>): unknown {
  const terminal = asObject(raw.terminal);
  return terminal?.defaultProfile ?? "shell";
}

function readTerminalProfiles(raw: Record<string, unknown>): Record<string, unknown> {
  const terminal = asObject(raw.terminal);
  const profiles = asObject(terminal?.profiles);
  return {
    ...buildDefaultTerminalProfileItems(),
    ...profiles,
  };
}

function mergeSettingsUpdate(
  raw: Record<string, unknown>,
  update: LifecycleSettingsUpdate,
): Record<string, unknown> {
  const next = { ...raw };
  const terminalUpdateRequested = update.terminal !== undefined;

  if (terminalUpdateRequested) {
    next.terminal = migrateLegacyTerminalSettingsObject(asObject(next.terminal));
  }

  if (update.appearance?.theme !== undefined) {
    const appearance = { ...asObject(next.appearance) };
    appearance.theme = update.appearance.theme;
    next.appearance = appearance;
    delete next.theme;
  }

  if (update.providers?.claude?.loginMethod !== undefined) {
    const providers = { ...asObject(next.providers) };
    const claude = { ...asObject(providers.claude) };
    claude.loginMethod = update.providers.claude.loginMethod;
    providers.claude = claude;
    next.providers = providers;
  }

  if (update.terminal?.command?.program !== undefined) {
    const terminal = { ...asObject(next.terminal) };
    const command = { ...asObject(terminal.command) };
    if (update.terminal.command.program === null) {
      delete command.program;
    } else {
      command.program = update.terminal.command.program;
    }
    terminal.command = command;
    delete terminal.shell;
    next.terminal = terminal;
  }

  if (
    update.terminal?.persistence?.backend !== undefined ||
    update.terminal?.persistence?.mode !== undefined ||
    update.terminal?.persistence?.executablePath !== undefined
  ) {
    const terminal = { ...asObject(next.terminal) };
    const persistence = { ...asObject(terminal.persistence) };

    if (update.terminal?.persistence?.backend !== undefined) {
      persistence.backend = update.terminal.persistence.backend;
    }

    if (update.terminal?.persistence?.mode !== undefined) {
      persistence.mode = update.terminal.persistence.mode;
    }

    if (update.terminal?.persistence?.executablePath !== undefined) {
      if (update.terminal.persistence.executablePath === null) {
        delete persistence.executablePath;
      } else {
        persistence.executablePath = update.terminal.persistence.executablePath;
      }
    }

    terminal.persistence = persistence;
    delete terminal.tmux;
    next.terminal = terminal;
  }

  if (update.terminal?.defaultProfile !== undefined || update.terminal?.profiles !== undefined) {
    const terminal = { ...asObject(next.terminal) };
    const profiles = {
      ...buildDefaultTerminalProfileItems(),
      ...asObject(terminal.profiles),
    };

    if (update.terminal?.defaultProfile !== undefined) {
      terminal.defaultProfile = update.terminal.defaultProfile;
    }

    if (update.terminal?.profiles !== undefined) {
      for (const [profileId, profile] of Object.entries(update.terminal.profiles)) {
        if (profile === null) {
          delete profiles[profileId];
          continue;
        }
        profiles[profileId] = profile;
      }
    }

    terminal.profiles = profiles;
    next.terminal = terminal;
  }

  return next;
}

function migrateLegacyTerminalSettingsObject(
  terminal: Record<string, unknown> | null,
): Record<string, unknown> {
  const next = { ...terminal };
  const command = { ...asObject(next.command) };
  const shell = asObject(next.shell);
  if (command.program === undefined && shell?.program !== undefined) {
    command.program = shell.program;
  }

  if (Object.keys(command).length > 0) {
    next.command = command;
  }

  const persistence = { ...asObject(next.persistence) };
  const tmux = asObject(next.tmux);
  if (persistence.backend === undefined) {
    persistence.backend = "tmux";
  }
  if (persistence.mode === undefined && tmux?.mode !== undefined) {
    persistence.mode = tmux.mode;
  }
  if (persistence.executablePath === undefined && tmux?.program !== undefined) {
    persistence.executablePath = tmux.program;
  }

  if (Object.keys(persistence).length > 0) {
    next.persistence = persistence;
  }

  delete next.shell;
  delete next.tmux;
  return next;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function buildDefaultTerminalProfileItems(): Record<string, unknown> {
  return structuredClone(LifecycleDefaultTerminalProfileItems) as Record<string, unknown>;
}
