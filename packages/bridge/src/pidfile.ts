import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface BridgePidfile {
  pid: number;
  port: number;
}

export function pidfilePath(): string {
  return join(homedir(), ".lifecycle", "bridge.json");
}

export async function readPidfile(): Promise<BridgePidfile | null> {
  try {
    return JSON.parse(await readFile(pidfilePath(), "utf8")) as BridgePidfile;
  } catch {
    return null;
  }
}

export async function writePidfile(entry: BridgePidfile): Promise<void> {
  const path = pidfilePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(entry) + "\n", "utf8");
}

export async function removePidfile(): Promise<void> {
  try {
    await rm(pidfilePath());
  } catch {
    // already gone
  }
}
