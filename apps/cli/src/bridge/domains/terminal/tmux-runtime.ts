import type {
  LifecycleTerminalPersistenceBackend,
  LifecycleTerminalPersistenceMode,
} from "@lifecycle/contracts";
import type {
  WorkspaceShellLaunchSpec,
  WorkspaceTerminalKind,
  WorkspaceTerminalRecord,
} from "../workspace/host";

export const TMUX_TERMINAL_RECORD_FORMAT =
  "#{window_id}\t#{window_name}\t#{window_activity_flag}\t#{window_active}";
const TMUX_CREATED_WINDOW_ID_FORMAT = "#{window_id}";
const TMUX_SCROLLBACK_CAPTURE_LINES = 2_000;
const MANAGED_TMUX_PROFILE_VERSION = 2;
// tmux server options live for the lifetime of the socket. Bump the managed
// socket namespace when Lifecycle changes its expected managed profile so new
// clients do not inherit stale option state from an older server instance.
export const MANAGED_TMUX_SOCKET_NAME = `lifecycle-managed-v${MANAGED_TMUX_PROFILE_VERSION}`;

export interface TmuxRuntimeProfile {
  baseArgs: string[];
  backend: LifecycleTerminalPersistenceBackend;
  mode: LifecycleTerminalPersistenceMode;
  program: string;
}

export interface ResolveTmuxRuntimeProfileInput {
  persistenceBackend?: LifecycleTerminalPersistenceBackend;
  persistenceMode?: LifecycleTerminalPersistenceMode;
  persistenceExecutablePath?: string | null;
}

export function resolveTmuxRuntimeProfile(
  input: ResolveTmuxRuntimeProfileInput = {},
): TmuxRuntimeProfile {
  const backend = input.persistenceBackend ?? "tmux";
  const fallbackProgram = backend === "zellij" ? "zellij" : "tmux";
  const program = input.persistenceExecutablePath?.trim() || fallbackProgram;
  const mode = input.persistenceMode ?? "inherit";

  if (backend === "tmux" && mode === "managed") {
    return {
      baseArgs: ["-L", MANAGED_TMUX_SOCKET_NAME, "-f", "/dev/null"],
      backend,
      mode,
      program,
    };
  }

  return {
    baseArgs: [],
    backend,
    mode,
    program,
  };
}

export function buildTmuxCommand(profile: TmuxRuntimeProfile, args: string[]): string[] {
  return [profile.program, ...profile.baseArgs, ...args];
}

export function buildTmuxCommandText(profile: TmuxRuntimeProfile, args: string[]): string {
  return buildTmuxCommand(profile, args).map(shellEscape).join(" ");
}

export function buildTmuxLaunchEnv(profile: TmuxRuntimeProfile): Array<[string, string]> {
  const env: Array<[string, string]> = [["TERM", "xterm-256color"]];

  if (profile.mode === "managed") {
    // Managed tmux should not inherit an outer tmux client context when the
    // app or CLI itself was launched from inside tmux.
    env.push(["TMUX", ""], ["TMUX_PANE", ""]);
  }

  return env;
}

export function buildTmuxConnectionId(
  sessionName: string,
  clientId: string,
  terminalId: string,
): string {
  const normalizedTerminalId = normalizeTmuxTerminalId(terminalId);
  return [
    sanitizeTmuxNamePart(sessionName),
    "conn",
    sanitizeTmuxNamePart(clientId),
    sanitizeTmuxNamePart(normalizedTerminalId),
  ].join("--");
}

export function buildEnsureTmuxSessionCommand(
  profile: TmuxRuntimeProfile,
  sessionName: string,
  cwd: string,
  initialTitle = "shell",
  environment: Array<[string, string]> = [],
): string {
  const commands = [
    [
      buildTmuxCommandText(profile, ["has-session", "-t", sessionName]),
      "2>/dev/null ||",
      buildTmuxCommandText(profile, [
        "new-session",
        "-d",
        "-s",
        sessionName,
        "-c",
        cwd,
        "-n",
        initialTitle,
      ]),
    ].join(" "),
    ...buildTmuxSessionEnvironmentCommands(profile, sessionName, environment),
    ...buildTmuxSessionOptionCommands(profile, sessionName),
  ];

  return commands.join("; ");
}

export function buildEnsureTmuxConnectionCommand(
  profile: TmuxRuntimeProfile,
  sessionName: string,
  connectionId: string,
  terminalId: string,
  cwd: string,
  environment: Array<[string, string]> = [],
): string {
  return [
    buildEnsureTmuxSessionCommand(profile, sessionName, cwd, "shell", environment),
    [
      buildTmuxCommandText(profile, ["has-session", "-t", connectionId]),
      "2>/dev/null ||",
      buildTmuxCommandText(profile, ["new-session", "-d", "-t", sessionName, "-s", connectionId]),
    ].join(" "),
    ...buildTmuxSessionEnvironmentCommands(profile, connectionId, environment),
    ...buildTmuxSessionOptionCommands(profile, connectionId),
    buildTmuxCommandText(profile, [
      "select-window",
      "-t",
      buildTmuxTerminalTarget(connectionId, terminalId),
    ]),
  ].join("; ");
}

export function buildSafeKillTmuxSessionCommand(
  profile: TmuxRuntimeProfile,
  connectionId: string,
): string {
  return [
    buildTmuxCommandText(profile, ["has-session", "-t", connectionId]),
    "2>/dev/null &&",
    buildTmuxCommandText(profile, ["kill-session", "-t", connectionId]),
    "|| true",
  ].join(" ");
}

export function buildTmuxListTerminalArgs(sessionName: string): string[] {
  return ["list-windows", "-t", sessionName, "-F", TMUX_TERMINAL_RECORD_FORMAT];
}

export function buildTmuxCreateTerminalArgs(
  sessionName: string,
  cwd: string,
  title: string,
  launchSpec?: WorkspaceShellLaunchSpec | null,
): string[] {
  const args = [
    "new-window",
    "-P",
    "-F",
    TMUX_CREATED_WINDOW_ID_FORMAT,
    "-t",
    sessionName,
    "-c",
    cwd,
    "-n",
    title,
  ];

  const launchCommand = buildShellLaunchCommandText(launchSpec);
  if (launchCommand) {
    args.push(launchCommand);
  }

  return args;
}

export function buildTmuxCloseTerminalArgs(sessionName: string, terminalId: string): string[] {
  return ["kill-window", "-t", buildTmuxTerminalTarget(sessionName, terminalId)];
}

export function buildTmuxCaptureHistoryArgs(
  sessionName: string,
  terminalId: string,
  lines = TMUX_SCROLLBACK_CAPTURE_LINES,
): string[] {
  return [
    "capture-pane",
    "-p",
    "-e",
    "-t",
    buildTmuxTerminalTarget(sessionName, terminalId),
    "-S",
    String(-Math.max(1, lines)),
  ];
}

export function parseTmuxTerminalRecords(stdout: string): WorkspaceTerminalRecord[] {
  const rows = stdout
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row) => row.length > 0)
    .map(parseTmuxTerminalRow)
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    busy: row.busy,
  }));
}

export function parseCreatedTmuxTerminalId(stdout: string): string | null {
  const row = stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.length > 0);

  if (!row) {
    return null;
  }

  const normalized = normalizeTmuxTerminalId(row);
  return isTmuxTerminalId(normalized) ? normalized : null;
}

export async function resolveCreatedTmuxTerminal<Record>(
  listTerminals: () => Promise<Record[]>,
  getTerminalId: (record: Record) => string,
  options?: {
    createdId?: string | null;
    previousTerminalIds?: Iterable<string>;
    retries?: number;
    delayMs?: number;
  },
): Promise<Record | null> {
  const createdId = options?.createdId ?? null;
  const previousTerminalIds = options?.previousTerminalIds
    ? new Set(options.previousTerminalIds)
    : null;
  const retries = options?.retries ?? 4;
  const delayMs = options?.delayMs ?? 40;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const terminals = await listTerminals();

    if (createdId) {
      const created = terminals.find((terminal) => getTerminalId(terminal) === createdId);
      if (created) {
        return created;
      }
    }

    if (previousTerminalIds) {
      const newTerminals = terminals.filter(
        (terminal) => !previousTerminalIds.has(getTerminalId(terminal)),
      );
      if (newTerminals.length === 1) {
        return newTerminals[0] ?? null;
      }
    }

    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
}

export function normalizeTerminalTitle(
  title: string | null | undefined,
  kind: WorkspaceTerminalKind | undefined,
): string {
  const trimmed = title?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }

  switch (kind) {
    case "claude":
      return "claude";
    case "codex":
      return "codex";
    case "opencode":
      return "opencode";
    case "custom":
      return "custom";
    case "shell":
    default:
      return "shell";
  }
}

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function buildTmuxTerminalTarget(sessionName: string, terminalId: string): string {
  return `${sessionName}:${normalizeTmuxTerminalId(terminalId)}`;
}

function buildTmuxSessionOptionCommands(
  profile: TmuxRuntimeProfile,
  sessionName: string,
): string[] {
  const commands = [
    buildTmuxCommandText(profile, ["set-option", "-t", sessionName, "window-size", "latest"]),
    buildTmuxCommandText(profile, ["set-option", "-t", sessionName, "mouse", "on"]),
  ];

  if (profile.mode === "managed") {
    commands.unshift(
      buildTmuxCommandText(profile, ["set-option", "-t", sessionName, "status", "off"]),
    );
  }

  return commands;
}

function buildTmuxSessionEnvironmentCommands(
  profile: TmuxRuntimeProfile,
  sessionName: string,
  environment: Array<[string, string]>,
): string[] {
  return environment.map(([key, value]) =>
    buildTmuxCommandText(profile, ["set-environment", "-t", sessionName, key, value]),
  );
}

function inferTerminalKind(title: string): WorkspaceTerminalKind {
  const normalized = title.trim().toLowerCase();
  if (/^claude(?:\s+\d+)?$/.test(normalized)) {
    return "claude";
  }

  if (/^codex(?:\s+\d+)?$/.test(normalized)) {
    return "codex";
  }
  if (/^opencode(?:\s+\d+)?$/.test(normalized)) {
    return "opencode";
  }
  if (/^tab\s+\d+$/.test(normalized)) {
    return "shell";
  }

  switch (normalized) {
    case "shell":
      return "shell";
    default:
      return "custom";
  }
}

function buildShellLaunchCommandText(
  spec: WorkspaceShellLaunchSpec | null | undefined,
): string | null {
  if (!spec) {
    return null;
  }

  const envArgs = spec.env.map(([key, value]) => `${key}=${value}`);
  return ["env", ...envArgs, spec.program, ...spec.args].map(shellEscape).join(" ");
}

function parseTmuxTerminalRow(row: string): {
  id: string;
  title: string;
  kind: WorkspaceTerminalKind;
  busy: boolean;
} | null {
  const tabParts = row.split("\t");
  if (tabParts.length >= 3) {
    return buildTmuxTerminalRecord(tabParts[0] ?? "", tabParts[1] ?? "", tabParts[2] ?? "0");
  }

  const spaced = row.match(/^(@?\d+)\s+(.+?)\s+([01])\s+([01])$/);
  if (spaced) {
    const [, id = "", title = "", activity = "0"] = spaced;
    return buildTmuxTerminalRecord(id, title, activity);
  }

  const normalizedId = normalizeTmuxTerminalId(row);
  if (!isTmuxTerminalId(normalizedId)) {
    return null;
  }

  return buildTmuxTerminalRecord(normalizedId, "", "0");
}

function buildTmuxTerminalRecord(idCandidate: string, rawTitle: string, activity: string) {
  const id = normalizeTmuxTerminalId(idCandidate);
  if (!isTmuxTerminalId(id)) {
    return null;
  }

  const title = rawTitle.trim();
  const kind = inferTerminalKind(title);
  return {
    id,
    title: title.length > 0 ? title : kind,
    kind,
    busy: activity.trim() === "1",
  };
}

function isTmuxTerminalId(value: string): boolean {
  return /^@\d+$/.test(value.trim());
}

function canonicalizeTmuxNumericId(value: string): string {
  const trimmed = value.trim().replace(/^@/, "");
  const normalized = trimmed.replace(/^0+/, "");
  return `@${normalized.length > 0 ? normalized : "0"}`;
}

export function normalizeTmuxTerminalId(value: string): string {
  const trimmed = value.trim();

  const canonicalId = trimmed.match(/^@?(\d+)/)?.[1];
  if (canonicalId) {
    return canonicalizeTmuxNumericId(canonicalId);
  }

  return trimmed;
}

function sanitizeTmuxNamePart(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "x";
  }

  return trimmed.replace(/[^A-Za-z0-9._-]+/g, "_");
}
