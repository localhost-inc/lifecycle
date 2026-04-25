import { extname, resolve } from "node:path";

export interface CliInvocation {
  argsPrefix: string[];
  binary: string;
}

export function resolveCurrentCliInvocation(argv: string[] = process.argv): CliInvocation {
  const entrypoint = argv[1]?.trim();
  if (entrypoint) {
    const extension = extname(entrypoint);
    if (
      extension === ".ts" ||
      extension === ".js" ||
      extension === ".mjs" ||
      extension === ".cjs"
    ) {
      return {
        binary: process.execPath,
        argsPrefix: [resolve(entrypoint)],
      };
    }
  }

  return { binary: process.execPath, argsPrefix: [] };
}
