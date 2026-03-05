export const HELP_TEXT = `Lifecycle CLI (M0 scaffold)

Usage:
  lifecycle --help

Commands:
  --help    Show this message
`;

export interface CliIo {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

const defaultIo: CliIo = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
};

export function runCli(argv: string[], io: CliIo = defaultIo): number {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    io.stdout(HELP_TEXT);
    return 0;
  }

  io.stderr(`Unknown arguments: ${argv.join(" ")}`);
  io.stderr("Run lifecycle --help for usage.");
  return 1;
}

if (import.meta.main) {
  process.exit(runCli(process.argv.slice(2)));
}
