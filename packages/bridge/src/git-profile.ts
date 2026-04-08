import { execFile } from "node:child_process";

export interface GitProfile {
  name: string | null;
  email: string | null;
  login: string | null;
  avatarUrl: string | null;
}

export async function resolveGitProfile(): Promise<GitProfile | null> {
  const name = await gitConfig("user.name");
  const email = await gitConfig("user.email");

  if (!name && !email) return null;

  // Try GitHub CLI for avatar and login.
  const gh = await ghUser();

  return {
    name: name ?? gh?.name ?? null,
    email: email ?? gh?.email ?? null,
    login: gh?.login ?? null,
    avatarUrl: gh?.avatarUrl ?? null,
  };
}

async function gitConfig(key: string): Promise<string | null> {
  try {
    const value = await exec("git", ["config", "--global", key]);
    return value.trim() || null;
  } catch {
    return null;
  }
}

interface GhUserResult {
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

async function ghUser(): Promise<GhUserResult | null> {
  try {
    const raw = await exec("gh", ["api", "user", "--jq", "[.login, .avatar_url, .name, .email] | @tsv"]);
    const parts = raw.trim().split("\t");
    if (!parts[0]) return null;
    return {
      login: parts[0],
      avatarUrl: parts[1] || null,
      name: parts[2] || null,
      email: parts[3] || null,
    };
  } catch {
    return null;
  }
}

function exec(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 5000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}
