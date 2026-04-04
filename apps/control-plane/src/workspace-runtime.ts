export const CLOUD_HOME_PATH = "/home/lifecycle";
export const CLOUD_WORKTREE_PATH = "/workspace";

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function validateEnvironmentKey(key: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`Invalid environment variable name: ${key}`);
  }
}

export function buildWorkspaceExecCommand(
  command: string[],
  options?: {
    cwd?: string;
    env?: Record<string, string>;
  },
): string {
  if (command.length === 0) {
    throw new Error("Command must not be empty.");
  }

  const steps: string[] = [];

  if (options?.env) {
    for (const [key, value] of Object.entries(options.env)) {
      validateEnvironmentKey(key);
      steps.push(`export ${key}=${shellEscape(value)}`);
    }
  }

  if (options?.cwd) {
    steps.push(`cd ${shellEscape(options.cwd)}`);
  }

  steps.push(`exec ${command.map(shellEscape).join(" ")}`);
  return steps.join(" && ");
}
