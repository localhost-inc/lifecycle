import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import TOML from "smol-toml";
import type { TomlTable } from "smol-toml";

import { LifecycleCliError } from "../errors";

export type McpScope = "user" | "project" | "local";

export type McpEntry = {
  args: string[];
  command: string;
};

export type McpInstallStatus = "created" | "updated" | "unchanged";
export type McpCheckStatus = "installed" | "missing" | "outdated";

type HarnessFormat = "json" | "toml";

export interface McpHarness {
  format: HarnessFormat;
  id: string;
  label: string;
  paths: Partial<Record<McpScope, string>>;
}

export interface ResolvedMcpTarget {
  format: HarnessFormat;
  harness_id: string;
  label: string;
  path: string;
  scope: McpScope;
}

const home = os.homedir();

const MCP_HARNESSES: readonly McpHarness[] = [
  {
    format: "json",
    id: "claude-code",
    label: "Claude Code",
    paths: {
      local: ".claude/settings.local.json",
      project: ".mcp.json",
      user: path.join(home, ".claude", "settings.json"),
    },
  },
  {
    format: "toml",
    id: "codex",
    label: "Codex",
    paths: {
      project: ".codex/config.toml",
      user: path.join(home, ".codex", "config.toml"),
    },
  },
] as const;

export function listMcpHarnesses(): readonly McpHarness[] {
  return MCP_HARNESSES;
}

export function resolveMcpTargets(scope: McpScope, cwd = process.cwd()): ResolvedMcpTarget[] {
  return MCP_HARNESSES.flatMap((harness) => {
    const rawPath = harness.paths[scope];
    if (!rawPath) {
      return [];
    }

    return [
      {
        format: harness.format,
        harness_id: harness.id,
        label: harness.label,
        path: path.isAbsolute(rawPath) ? rawPath : path.join(cwd, rawPath),
        scope,
      } satisfies ResolvedMcpTarget,
    ];
  });
}

export function checkMcpTarget(target: ResolvedMcpTarget, entry: McpEntry): McpCheckStatus {
  const normalizedEntry = normalizeMcpEntry(target, entry);
  switch (target.format) {
    case "json":
      return evaluateJsonTarget(target.path, normalizedEntry).status;
    case "toml":
      return evaluateTomlTarget(target.path, normalizedEntry).status;
  }
}

export function installMcpTarget(target: ResolvedMcpTarget, entry: McpEntry): McpInstallStatus {
  const normalizedEntry = normalizeMcpEntry(target, entry);
  switch (target.format) {
    case "json":
      return installJsonTarget(target.path, normalizedEntry);
    case "toml":
      return installTomlTarget(target.path, normalizedEntry);
  }
}

function normalizeMcpEntry(target: ResolvedMcpTarget, entry: McpEntry): McpEntry {
  if (target.scope !== "project") {
    return entry;
  }

  return {
    ...entry,
    command: "lifecycle",
  };
}

function installJsonTarget(filePath: string, entry: McpEntry): McpInstallStatus {
  const snapshot = evaluateJsonTarget(filePath, entry);
  if (!snapshot.nextContent) {
    return "unchanged";
  }

  writeFile(filePath, snapshot.nextContent);
  return snapshot.fileExists ? "updated" : "created";
}

function evaluateJsonTarget(
  filePath: string,
  entry: McpEntry,
): {
  fileExists: boolean;
  nextContent: string | null;
  status: McpCheckStatus;
} {
  const raw = readFileOrNull(filePath);
  const config = raw ? parseJsonObject(filePath, raw) : {};
  const mcpServers = readJsonObjectField(filePath, config, "mcpServers");
  const lifecycle = readJsonObjectField(filePath, mcpServers, "lifecycle");
  const lifecycleBase = lifecycle ?? {};
  const mergedLifecycle = {
    ...lifecycleBase,
    args: [...entry.args],
    command: entry.command,
  };

  if (lifecycle && lifecycleCommandMatches(lifecycle, entry)) {
    return {
      fileExists: raw !== null,
      nextContent: null,
      status: "installed",
    };
  }

  const nextConfig = {
    ...config,
    mcpServers: {
      ...mcpServers,
      lifecycle: mergedLifecycle,
    },
  };

  return {
    fileExists: raw !== null,
    nextContent: `${JSON.stringify(nextConfig, null, 2)}\n`,
    status: lifecycle ? "outdated" : "missing",
  };
}

function installTomlTarget(filePath: string, entry: McpEntry): McpInstallStatus {
  const snapshot = evaluateTomlTarget(filePath, entry);
  if (!snapshot.nextContent) {
    return "unchanged";
  }

  writeFile(filePath, snapshot.nextContent);
  return snapshot.fileExists ? "updated" : "created";
}

function evaluateTomlTarget(
  filePath: string,
  entry: McpEntry,
): {
  fileExists: boolean;
  nextContent: string | null;
  status: McpCheckStatus;
} {
  const raw = readFileOrNull(filePath);
  const config = raw ? parseTomlTable(filePath, raw) : {};
  const mcpServers = readTomlTableField(filePath, config, "mcp_servers");
  const lifecycle = readTomlTableField(filePath, mcpServers, "lifecycle");
  const lifecycleBase = lifecycle ?? {};
  const mergedLifecycle = {
    ...lifecycleBase,
    args: [...entry.args],
    command: entry.command,
  } satisfies TomlTable;

  if (lifecycle && lifecycleCommandMatches(lifecycle, entry)) {
    return {
      fileExists: raw !== null,
      nextContent: null,
      status: "installed",
    };
  }

  return {
    fileExists: raw !== null,
    nextContent: upsertTomlLifecycleBlock(filePath, raw ?? "", mergedLifecycle, lifecycle !== null),
    status: lifecycle ? "outdated" : "missing",
  };
}

function upsertTomlLifecycleBlock(
  filePath: string,
  raw: string,
  lifecycle: TomlTable,
  hasExistingLifecycle: boolean,
): string {
  const lines = splitLines(raw);
  const headerIndex = lines.findIndex((line) => /^\s*\[mcp_servers\.lifecycle\]\s*$/.test(line));
  if (headerIndex === -1) {
    if (hasExistingLifecycle) {
      throw new LifecycleCliError({
        code: "config_unsupported",
        details: { filePath },
        message: `Lifecycle could not safely merge ${filePath} because the lifecycle MCP entry is not stored as [mcp_servers.lifecycle].`,
        suggestedAction:
          "Convert the lifecycle MCP entry to [mcp_servers.lifecycle] table format or update it manually.",
      });
    }

    const block = renderTomlLifecycleBlock(lifecycle);
    if (raw.trim().length === 0) {
      return block;
    }

    return `${raw.replace(/\s*$/u, "")}\n\n${block}`;
  }

  let nextHeaderIndex = lines.length;
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    if (/^\s*\[[^\]]+\]\s*$/.test(lines[index] ?? "")) {
      nextHeaderIndex = index;
      break;
    }
  }

  const blockLines = lines.slice(headerIndex, nextHeaderIndex);
  const headerLine = blockLines[0] ?? "[mcp_servers.lifecycle]";
  const bodyLines = blockLines.slice(1).filter((line) => !/^\s*(command|args)\s*=/.test(line));
  const trailingBlankLines: string[] = [];
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1]?.trim() === "") {
    trailingBlankLines.unshift(bodyLines.pop()!);
  }

  const rewrittenBlock = [
    headerLine,
    ...bodyLines,
    renderTomlAssignment("command", lifecycle.command),
    renderTomlAssignment("args", lifecycle.args),
    ...trailingBlankLines,
  ];

  return [...lines.slice(0, headerIndex), ...rewrittenBlock, ...lines.slice(nextHeaderIndex)].join(
    "\n",
  );
}

function renderTomlLifecycleBlock(lifecycle: TomlTable): string {
  return `${TOML.stringify({
    mcp_servers: {
      lifecycle,
    },
  }).trimEnd()}\n`;
}

function renderTomlAssignment(key: string, value: unknown): string {
  return TOML.stringify({ [key]: value }).trimEnd();
}

function lifecycleCommandMatches(lifecycle: Record<string, unknown>, entry: McpEntry): boolean {
  return (
    lifecycle.command === entry.command &&
    Array.isArray(lifecycle.args) &&
    lifecycle.args.length === entry.args.length &&
    lifecycle.args.every((value, index) => value === entry.args[index])
  );
}

function readJsonObjectField(
  filePath: string,
  source: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  if (source === null) {
    return null;
  }

  const value = source[key];
  if (value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    throw new LifecycleCliError({
      code: "config_invalid",
      details: { filePath, key },
      message: `Lifecycle expected ${key} in ${filePath} to be a JSON object.`,
      suggestedAction: "Fix the invalid config manually, then retry the install.",
    });
  }

  return value;
}

function readTomlTableField(
  filePath: string,
  source: TomlTable | null,
  key: string,
): TomlTable | null {
  if (source === null) {
    return null;
  }

  const value = source[key];
  if (value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    throw new LifecycleCliError({
      code: "config_invalid",
      details: { filePath, key },
      message: `Lifecycle expected ${key} in ${filePath} to be a TOML table.`,
      suggestedAction: "Fix the invalid config manually, then retry the install.",
    });
  }

  return value as TomlTable;
}

function parseJsonObject(filePath: string, raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new LifecycleCliError({
      code: "config_invalid",
      details: { filePath },
      message: `Lifecycle could not parse ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      suggestedAction: "Fix the invalid config manually, then retry the install.",
    });
  }

  if (!isRecord(parsed)) {
    throw new LifecycleCliError({
      code: "config_invalid",
      details: { filePath },
      message: `Lifecycle expected ${filePath} to contain a JSON object.`,
      suggestedAction: "Fix the invalid config manually, then retry the install.",
    });
  }

  return parsed;
}

function parseTomlTable(filePath: string, raw: string): TomlTable {
  let parsed: unknown;
  try {
    parsed = TOML.parse(raw);
  } catch (error) {
    throw new LifecycleCliError({
      code: "config_invalid",
      details: { filePath },
      message: `Lifecycle could not parse ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      suggestedAction: "Fix the invalid config manually, then retry the install.",
    });
  }

  if (!isRecord(parsed)) {
    throw new LifecycleCliError({
      code: "config_invalid",
      details: { filePath },
      message: `Lifecycle expected ${filePath} to contain a TOML table.`,
      suggestedAction: "Fix the invalid config manually, then retry the install.",
    });
  }

  return parsed as TomlTable;
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function readFileOrNull(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function splitLines(raw: string): string[] {
  if (raw.length === 0) {
    return [];
  }

  const normalized = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  return normalized.split(/\r?\n/u);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
