import { execSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const WORKSPACE_HOME = "/home/lifecycle";

// ── Structured profile ─────────────────────────────────────────────

export interface GitProfile {
  name: string;
  email: string;
  /** Number of aliases found in .gitconfig */
  aliasCount: number;
  /** Raw .gitconfig content (base64) — includes identity, aliases, colors, etc. */
  configBase64: string;
}

export interface ClaudeCredentials {
  accessToken: string;
  refreshToken: string | null;
  subscriptionType: string | null;
}

export interface ClaudeConfig {
  /** Resolved settings.json content (base64) */
  settingsBase64: string;
}

export interface CodexCredentials {
  /** auth.json content (base64) */
  authBase64: string;
}

export interface EnvironmentProfile {
  git: GitProfile | null;
  claude: ClaudeCredentials | null;
  claudeConfig: ClaudeConfig | null;
  codex: CodexCredentials | null;
}

// ── Detection ───────────────────────────────────────────────────────

export function detectEnvironment(): EnvironmentProfile {
  return {
    git: detectGit(),
    claude: detectClaude(),
    claudeConfig: detectClaudeConfig(),
    codex: detectCodex(),
  };
}

function detectGit(): GitProfile | null {
  try {
    const gitconfigPath = join(homedir(), ".gitconfig");
    const content = readFileSync(gitconfigPath);
    const text = content.toString("utf8");

    // Extract identity
    const name = execSync("git config --global user.name", { encoding: "utf8" }).trim();
    const email = execSync("git config --global user.email", { encoding: "utf8" }).trim();
    if (!name || !email) return null;

    // Count aliases
    const aliasCount = (text.match(/^\s+\w+\s*=/gm) ?? []).length;

    return {
      name,
      email,
      aliasCount,
      configBase64: Buffer.from(content).toString("base64"),
    };
  } catch {
    return null;
  }
}

function detectClaude(): ClaudeCredentials | null {
  if (platform() !== "darwin") return null;

  try {
    const raw = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w',
      { encoding: "utf8", timeout: 5000 },
    ).trim();

    const parsed = JSON.parse(raw);
    const oauth = parsed?.claudeAiOauth;
    if (!oauth?.accessToken) return null;

    return {
      accessToken: oauth.accessToken,
      refreshToken: oauth.refreshToken ?? null,
      subscriptionType: oauth.subscriptionType ?? null,
    };
  } catch {
    return null;
  }
}

function detectClaudeConfig(): ClaudeConfig | null {
  try {
    const settingsPath = join(homedir(), ".claude", "settings.json");
    const resolved = realpathSync(settingsPath);
    const content = readFileSync(resolved);
    return { settingsBase64: Buffer.from(content).toString("base64") };
  } catch {
    return null;
  }
}

function detectCodex(): CodexCredentials | null {
  try {
    const authPath = join(homedir(), ".codex", "auth.json");
    const content = readFileSync(authPath);
    return { authBase64: Buffer.from(content).toString("base64") };
  } catch {
    return null;
  }
}

// ── Serialization (profile → shell commands for SSH injection) ──────

export function serializeProfile(profile: EnvironmentProfile): string[] {
  const cmds: string[] = [];

  if (profile.git) {
    cmds.push(`echo ${profile.git.configBase64} | base64 -d > ${WORKSPACE_HOME}/.gitconfig`);
  }

  if (profile.claude) {
    const envLines = [
      `export CLAUDE_CODE_OAUTH_TOKEN=${shellQuote(profile.claude.accessToken)}`,
    ];
    if (profile.claude.refreshToken) {
      envLines.push(`export CLAUDE_CODE_OAUTH_REFRESH_TOKEN=${shellQuote(profile.claude.refreshToken)}`);
    }
    const encoded = Buffer.from(envLines.join("\n")).toString("base64");
    cmds.push(
      `echo ${encoded} | base64 -d > ${WORKSPACE_HOME}/.lifecycle-env`,
      `chmod 600 ${WORKSPACE_HOME}/.lifecycle-env`,
    );
  }

  if (profile.claudeConfig) {
    cmds.push(
      `mkdir -p ${WORKSPACE_HOME}/.claude`,
      `echo ${profile.claudeConfig.settingsBase64} | base64 -d > ${WORKSPACE_HOME}/.claude/settings.json`,
    );
  }

  if (profile.codex) {
    cmds.push(
      `mkdir -p ${WORKSPACE_HOME}/.codex`,
      `echo ${profile.codex.authBase64} | base64 -d > ${WORKSPACE_HOME}/.codex/auth.json`,
    );
  }

  return cmds;
}

/**
 * Gather local environment and return shell commands to sync it
 * into a cloud workspace. Convenience wrapper: detect + serialize.
 */
export function gatherEnvironment(): string[] {
  return serializeProfile(detectEnvironment());
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
