import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface BridgeRegistration {
  pid: number;
  port: number;
}

export function bridgeRegistrationPath(): string {
  return join(homedir(), ".lifecycle", "bridge.json");
}

export async function readBridgeRegistration(): Promise<BridgeRegistration | null> {
  try {
    return JSON.parse(await readFile(bridgeRegistrationPath(), "utf8")) as BridgeRegistration;
  } catch {
    return null;
  }
}

export async function writeBridgeRegistration(entry: BridgeRegistration): Promise<void> {
  const path = bridgeRegistrationPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(entry) + "\n", "utf8");
}

export async function removeBridgeRegistration(): Promise<void> {
  try {
    await rm(bridgeRegistrationPath());
  } catch {
    // already gone
  }
}
