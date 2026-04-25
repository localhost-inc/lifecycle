import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import { constants } from "node:fs";

const TITLE_TIMEOUT_MS = 12_000;
const TITLE_MAX_LENGTH = 48;
const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "can",
  "could",
  "for",
  "from",
  "i",
  "it",
  "me",
  "my",
  "of",
  "on",
  "our",
  "please",
  "re",
  "the",
  "this",
  "to",
  "we",
  "with",
]);

export interface GenerateWorkspaceTitleInput {
  cwd?: string | null;
  prompt: string;
}

export async function generateWorkspaceTitle(
  input: GenerateWorkspaceTitleInput,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const prompt = normalizePrompt(input.prompt);
  if (!prompt) {
    return null;
  }

  for (const generator of [generateWithCodex, generateWithClaude]) {
    const title = await generator({ ...input, prompt }, environment);
    if (title) {
      return title;
    }
  }

  return generateHeuristicTitle(prompt);
}

async function generateWithCodex(
  input: GenerateWorkspaceTitleInput,
  environment: NodeJS.ProcessEnv,
): Promise<string | null> {
  const binary = await findExecutable("codex", environment);
  if (!binary) {
    return null;
  }

  return runTitleCommand(
    binary,
    [
      "exec",
      "--sandbox",
      "read-only",
      "--ask-for-approval",
      "never",
      "--skip-git-repo-check",
      "--ephemeral",
      ...(input.cwd ? ["-C", input.cwd] : []),
      titlePrompt(input.prompt),
    ],
    environment,
  );
}

async function generateWithClaude(
  input: GenerateWorkspaceTitleInput,
  environment: NodeJS.ProcessEnv,
): Promise<string | null> {
  const binary = await findExecutable("claude", environment);
  if (!binary) {
    return null;
  }

  return runTitleCommand(
    binary,
    [
      "--print",
      "--bare",
      "--no-session-persistence",
      "--permission-mode",
      "bypassPermissions",
      "--tools",
      "",
      ...(input.cwd ? ["--add-dir", input.cwd] : []),
      titlePrompt(input.prompt),
    ],
    environment,
  );
}

function titlePrompt(prompt: string): string {
  return [
    "Generate a concise terminal tab title for this user prompt.",
    "Return only the title text.",
    "Rules: 2 to 6 words, no quotes, no punctuation unless needed, no trailing period.",
    "",
    "User prompt:",
    prompt,
  ].join("\n");
}

async function runTitleCommand(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: environment,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve(null);
    }, TITLE_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", () => {
      clearTimeout(timeout);
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve(code === 0 ? sanitizeTitle(stdout) : null);
    });
  });
}

async function findExecutable(
  name: string,
  environment: NodeJS.ProcessEnv,
): Promise<string | null> {
  if (isAbsolute(name)) {
    return (await canExecute(name)) ? name : null;
  }

  for (const entry of (environment.PATH ?? "").split(delimiter)) {
    if (!entry) {
      continue;
    }
    const candidate = join(entry, name);
    if (await canExecute(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function canExecute(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizePrompt(prompt: string): string | null {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function sanitizeTitle(raw: string): string | null {
  const firstLine = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) {
    return null;
  }

  const withoutQuotes = firstLine.replace(/^["'`]+|["'`]+$/g, "");
  const withoutTrailingPeriod = withoutQuotes.replace(/\.$/, "");
  const compact = withoutTrailingPeriod.replace(/\s+/g, " ").trim();
  if (!compact) {
    return null;
  }

  return compact.length <= TITLE_MAX_LENGTH
    ? compact
    : `${compact.slice(0, TITLE_MAX_LENGTH - 3)}...`;
}

function generateHeuristicTitle(prompt: string): string | null {
  const words = prompt
    .replace(/[`"'()[\]{}]/g, " ")
    .replace(/[^A-Za-z0-9/_ -]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  const selected = words.filter((word) => !TITLE_STOP_WORDS.has(word.toLowerCase())).slice(0, 6);
  const titleWords = selected.length >= 2 ? selected : words.slice(0, 6);
  if (titleWords.length === 0) {
    return null;
  }

  return sanitizeTitle(titleWords.map(toTitleWord).join(" "));
}

function toTitleWord(word: string): string {
  if (word === word.toUpperCase() && /[A-Z]/.test(word)) {
    return word;
  }

  return word
    .split(/([/_-])/)
    .map((part) =>
      part.length === 0 || /^[/_-]$/.test(part)
        ? part
        : `${part[0]?.toUpperCase() ?? ""}${part.slice(1).toLowerCase()}`,
    )
    .join("");
}
