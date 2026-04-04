import type {
  WorkspaceTerminalKind,
  WorkspaceTerminalRecord,
} from "../../workspace";

export const TMUX_TERMINAL_RECORD_FORMAT =
  "#{window_id}\t#{window_name}\t#{window_activity_flag}\t#{window_active}";

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
  sessionName: string,
  cwd: string,
  initialTitle = "shell",
): string {
  return [
    "tmux has-session -t",
    shellEscape(sessionName),
    "2>/dev/null || tmux new-session -d -s",
    shellEscape(sessionName),
    "-c",
    shellEscape(cwd),
    "-n",
    shellEscape(initialTitle),
  ].join(" ");
}

export function buildEnsureTmuxConnectionCommand(
  sessionName: string,
  connectionId: string,
  terminalId: string,
  cwd: string,
): string {
  return [
    buildEnsureTmuxSessionCommand(sessionName, cwd),
    [
      "tmux has-session -t",
      shellEscape(connectionId),
      "2>/dev/null || tmux new-session -d -t",
      shellEscape(sessionName),
      "-s",
      shellEscape(connectionId),
    ].join(" "),
    ["tmux select-window -t", shellEscape(buildTmuxTerminalTarget(connectionId, terminalId))].join(
      " ",
    ),
  ].join("; ");
}

export function buildSafeKillTmuxSessionCommand(connectionId: string): string {
  return [
    "tmux has-session -t",
    shellEscape(connectionId),
    "2>/dev/null && tmux kill-session -t",
    shellEscape(connectionId),
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
