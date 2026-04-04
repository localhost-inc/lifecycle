#!/usr/bin/env bun

import { runCli, type CliIo } from "@lifecycle/cmd";

export async function main(argv: string[] = Bun.argv.slice(2), io?: CliIo): Promise<number> {
  if (!io && argv.length === 0) {
    const { launchTui } = await import("./tui/launch");
    return launchTui({ env: process.env });
  }
  return runCli({
    name: "lifecycle",
    baseDir: import.meta.dir,
    argv,
    mcp: { version: "0.1.0" },
    ...(io ? { io } : {}),
  });
}

if (import.meta.main) {
  main().then((code) => {
    process.exit(code);
  });
}
