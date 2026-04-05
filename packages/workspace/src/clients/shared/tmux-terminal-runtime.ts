import type {
  LifecycleTerminalPersistenceBackend,
  LifecycleTerminalPersistenceMode,
} from "@lifecycle/contracts";
import type { WorkspaceTerminalKind, WorkspaceTerminalRecord } from "../../workspace";

export const TMUX_TERMINAL_RECORD_FORMAT =
  "#{window_id}\t#{window_name}\t#{window_activity_flag}\t#{window_active}";
const MANAGED_TMUX_PROFILE_VERSION = 2;
// tmux server options live for the lifetime of the socket. Bump the managed
// socket namespace when Lifecycle changes its expected managed profile so new
// clients do not inherit stale option state from an older server instance.
export const MANAGED_TMUX_SOCKET_NAME =
  `lifecycle-managed-v${MANAGED_TMUX_PROFILE_VERSION}`;

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
  return [
    sanitizeTmuxNamePart(sessionName),
    "conn",
    sanitizeTmuxNamePart(clientId),
    sanitizeTmuxNamePart(terminalId),
  ].join("--");
}

export function buildEnsureTmuxSessionCommand(
  profile: TmuxRuntimeProfile,
  sessionName: string,
  cwd: string,
  initialTitle = "shell",
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
): string {
  return [
    buildEnsureTmuxSessionCommand(profile, sessionName, cwd),
    [
      buildTmuxCommandText(profile, ["has-session", "-t", connectionId]),
      "2>/dev/null ||",
      buildTmuxCommandText(profile, ["new-session", "-d", "-t", sessionName, "-s", connectionId]),
    ].join(" "),
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
): string[] {
  return [
    "new-window",
    "-P",
    "-F",
    TMUX_TERMINAL_RECORD_FORMAT,
    "-t",
    sessionName,
    "-c",
    cwd,
    "-n",
    title,
  ];
}

export function buildTmuxCloseTerminalArgs(sessionName: string, terminalId: string): string[] {
  return ["kill-window", "-t", buildTmuxTerminalTarget(sessionName, terminalId)];
}

export function parseTmuxTerminalRecords(stdout: string): WorkspaceTerminalRecord[] {
  const rows = stdout
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row) => row.length > 0)
    .map((row) => {
      const [id = "", rawTitle = "", activity = "0"] = row.split("\t");
      const title = rawTitle.trim();
      const kind = inferTerminalKind(title);
      return {
        id: id.trim(),
        title: title.length > 0 ? title : kind,
        kind,
        busy: activity.trim() === "1",
      };
    })
    .filter((row) => row.id.length > 0);

  const closable = rows.length > 1;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    busy: row.busy,
    closable,
  }));
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
  return `${sessionName}:${terminalId}`;
}

function buildTmuxSessionOptionCommands(
  profile: TmuxRuntimeProfile,
  sessionName: string,
): string[] {
  const commands = [
    buildTmuxCommandText(profile, ["set-option", "-t", sessionName, "window-size", "latest"]),
  ];

  if (profile.mode === "managed") {
    commands.unshift(
      buildTmuxCommandText(profile, ["set-option", "-t", sessionName, "status", "off"]),
    );
  }

  return commands;
}

function inferTerminalKind(title: string): WorkspaceTerminalKind {
  switch (title.trim().toLowerCase()) {
    case "claude":
      return "claude";
    case "codex":
      return "codex";
    case "shell":
      return "shell";
    default:
      return "custom";
  }
}

function sanitizeTmuxNamePart(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "x";
  }

  return trimmed.replace(/[^A-Za-z0-9._-]+/g, "_");
}
