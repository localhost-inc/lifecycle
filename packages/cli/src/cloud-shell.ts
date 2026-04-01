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
    entryCommand?: string[];
  },
): string[] {
  const args = [
    "-tt",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR",
    `${connection.token}@${connection.host}`,
  ];

  if (options?.entryCommand && options.entryCommand.length > 0) {
    const cwd = connection.cwd ?? DEFAULT_CLOUD_WORKTREE;
    const entryCommand = options.entryCommand.map(shellEscape).join(" ");
    args.push(
      `exec "\${SHELL:-/bin/bash}" -lic ${shellEscape(`cd ${shellEscape(cwd)} && ${entryCommand}`)}`,
    );
  }

  return args;
}
