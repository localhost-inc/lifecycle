import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const CREDENTIALS_PATH = join(homedir(), ".lifecycle", "credentials.json");

export interface StoredCredentials {
  token: string;
  accessToken?: string | null;
  refreshToken: string | null;
  userId: string;
  email: string;
  displayName: string;
  activeOrgId: string | null;
  activeOrgSlug: string | null;
}

export function resolveStoredAccessToken(credentials: StoredCredentials | null): string | null {
  if (!credentials) {
    return null;
  }

  const explicitAccessToken =
    typeof credentials.accessToken === "string" ? credentials.accessToken.trim() : "";
  if (explicitAccessToken.length > 0) {
    return explicitAccessToken;
  }

  const fallbackToken = typeof credentials.token === "string" ? credentials.token.trim() : "";
  return fallbackToken.length > 0 ? fallbackToken : null;
}

export function readCredentials(): StoredCredentials | null {
  try {
    const text = readFileSync(CREDENTIALS_PATH, "utf8");
    const parsed = JSON.parse(text) as StoredCredentials;
    const accessToken = resolveStoredAccessToken(parsed);
    if (!accessToken) {
      return null;
    }

    return {
      ...parsed,
      token: accessToken,
      accessToken,
    };
  } catch {
    return null;
  }
}

export function writeCredentials(credentials: StoredCredentials): void {
  mkdirSync(dirname(CREDENTIALS_PATH), { recursive: true });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2), "utf8");
}

export function updateCredentials(updates: Partial<StoredCredentials>): StoredCredentials | null {
  const existing = readCredentials();
  if (!existing) return null;
  const merged = { ...existing, ...updates };
  writeCredentials(merged);
  return merged;
}

export function clearCredentials(): void {
  try {
    unlinkSync(CREDENTIALS_PATH);
  } catch {
    // File may not exist.
  }
}
