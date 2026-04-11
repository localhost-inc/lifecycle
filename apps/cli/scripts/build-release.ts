#!/usr/bin/env bun

import { chmod, copyFile, cp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "../..");
const outputDir = resolve(packageDir, "dist", "release");
const cliEntrypoint = resolve(packageDir, "src", "index.ts");
const bunRuntimePath = resolve(outputDir, "bun");
const cliBundlePath = resolve(outputDir, "lifecycle.js");
const cliLauncherPath = resolve(outputDir, "lifecycle");

function tursoSyncNativePackageName(): string {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "@tursodatabase/sync-darwin-arm64";
  }

  if (process.platform === "darwin" && process.arch === "x64") {
    return "@tursodatabase/sync-darwin-x64";
  }

  throw new Error(
    `Unsupported release host for bundled Turso sync native addon: ${process.platform}-${process.arch}`,
  );
}

async function stageRuntimeDependency(packageName: string): Promise<void> {
  const sourceSymlinkPath = resolve(
    repoRoot,
    "node_modules",
    ".bun",
    "node_modules",
    ...packageName.split("/"),
  );
  const sourcePath = await realpath(sourceSymlinkPath);
  const destinationPath = resolve(outputDir, "node_modules", ...packageName.split("/"));

  await mkdir(dirname(destinationPath), { recursive: true });
  await cp(sourcePath, destinationPath, { recursive: true });
}

async function runCommand(command: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(command, {
    cwd,
    stderr: "inherit",
    stdin: "inherit",
    stdout: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}: ${command.join(" ")}`);
  }
}

async function main(): Promise<void> {
  await rm(outputDir, { force: true, recursive: true });
  await mkdir(outputDir, { recursive: true });

  await runCommand(["bun", "build", "--target", "bun", "--outfile", cliBundlePath, cliEntrypoint], repoRoot);

  await copyFile(process.execPath, bunRuntimePath);
  await chmod(bunRuntimePath, 0o755);

  await writeFile(
    cliLauncherPath,
    [
      "#!/bin/sh",
      "set -eu",
      "SCRIPT_DIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)",
      "exec \"$SCRIPT_DIR/bun\" \"$SCRIPT_DIR/lifecycle.js\" \"$@\"",
      "",
    ].join("\n"),
    "utf8",
  );
  await chmod(cliLauncherPath, 0o755);
  await chmod(cliBundlePath, 0o755);

  await stageRuntimeDependency(tursoSyncNativePackageName());

  await runCommand([cliLauncherPath, "--help"], repoRoot);
  await runCommand([cliLauncherPath, "bridge", "start", "--help"], repoRoot);

  console.log(`Built release artifacts in ${outputDir}`);
}

await main();
