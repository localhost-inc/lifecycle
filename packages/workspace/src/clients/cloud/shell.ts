export interface CloudShellConnection {
  cwd?: string | null;
  home?: string | null;
  host: string;
  token: string;
}

const DEFAULT_CLOUD_WORKTREE = "/workspace";

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function buildCloudShellSshArgs(
  connection: CloudShellConnection,
  options?: {
    entryCommandText?: string | null;
  },
): string[] {
  const args = [
    "-tt",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR",
    `${connection.token}@${connection.host}`,
  ];

  const entryCommandText = options?.entryCommandText?.trim();
  if (entryCommandText) {
    const cwd = connection.cwd ?? DEFAULT_CLOUD_WORKTREE;
    args.push(
      `exec "\${SHELL:-/bin/bash}" -lic ${shellEscape(`cd ${shellEscape(cwd)} && ${entryCommandText}`)}`,
    );
  }

  return args;
}
