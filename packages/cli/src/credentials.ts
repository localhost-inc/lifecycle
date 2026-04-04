import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { LifecycleCliError } from "./errors";

const CREDENTIALS_DIR = path.join(homedir(), ".lifecycle");
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, "credentials.json");

export interface StoredCredentials {
  token: string;
  userId: string;
  email: string;
  displayName: string;
  activeOrgId: string | null;
  activeOrgSlug: string | null;
  accessToken: string | null;
  refreshToken: string | null;
}

export async function readCredentials(): Promise<StoredCredentials | null> {
  try {
    const text = await readFile(CREDENTIALS_FILE, "utf8");
    return JSON.parse(text) as StoredCredentials;
  } catch {
    return null;
  }
}

export async function writeCredentials(credentials: StoredCredentials): Promise<void> {
  await mkdir(CREDENTIALS_DIR, { recursive: true });
  await writeFile(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), "utf8");
}

export async function updateCredentials(
  updates: Partial<StoredCredentials>,
): Promise<StoredCredentials | null> {
  const existing = await readCredentials();
  if (!existing) {
    return null;
  }

  const merged = { ...existing, ...updates };
  await writeCredentials(merged);
  return merged;
}

export async function clearCredentials(): Promise<void> {
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(CREDENTIALS_FILE);
  } catch {
    // File may not exist
  }
}

export function requireActiveOrg(credentials: { activeOrgId: string | null }): string {
  if (!credentials.activeOrgId) {
    throw new LifecycleCliError({
      code: "organization_not_found",
      message: "No active organization.",
      suggestedAction: "Run `lifecycle org switch <name>` to select an organization.",
    });
  }
  return credentials.activeOrgId;
}
