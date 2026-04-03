import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineCommand } from "@lifecycle/cmd";
import { cancel, intro, isCancel, log, multiselect, outro } from "@clack/prompts";
import TOML from "smol-toml";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

type Scope = "user" | "project" | "local";

type McpEntry = { command: string; args: string[] };

type InstallResult = "installed" | "exists";

/**
 * To add a new harness, append to the `harnesses` array below.
 * Each harness declares which scopes it supports (via `paths`) and
 * provides an `install` function that knows how to read, merge, and
 * write its own config format.
 */
type Harness = {
  id: string;
  label: string;
  /** Config file path per scope. Relative paths resolve from cwd. */
  paths: Partial<Record<Scope, string>>;
  /** Read the config, insert the lifecycle entry, write it back. */
  install: (filePath: string, entry: McpEntry, force: boolean) => InstallResult;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const home = os.homedir();

function readFileOr(filePath: string, fallback: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return fallback;
  }
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

// ---------------------------------------------------------------------------
// JSON-based install (Claude Code, Cursor, etc.)
//
// Structure: { "mcpServers": { "<name>": { "command": "…", "args": […] } } }
// ---------------------------------------------------------------------------

function installJson(filePath: string, entry: McpEntry, force: boolean): InstallResult {
  const raw = readFileOr(filePath, "{}");
  const config = JSON.parse(raw) as Record<string, unknown>;
  const mcpServers = (config.mcpServers ?? {}) as Record<string, unknown>;

  if (mcpServers.lifecycle && !force) return "exists";

  mcpServers.lifecycle = { command: entry.command, args: entry.args };
  config.mcpServers = mcpServers;
  writeFile(filePath, JSON.stringify(config, null, 2) + "\n");
  return "installed";
}

// ---------------------------------------------------------------------------
// TOML-based install (Codex)
//
// Structure: [mcp_servers.<name>]
//            command = "…"
//            args = ["…"]
//
// We append rather than round-trip so comments and ordering are preserved.
// ---------------------------------------------------------------------------

function installToml(filePath: string, entry: McpEntry, force: boolean): InstallResult {
  const raw = readFileOr(filePath, "");
  const config = raw ? TOML.parse(raw) : {};
  const mcpServers = (config.mcp_servers ?? {}) as Record<string, unknown>;

  if (mcpServers.lifecycle && !force) return "exists";

  mcpServers.lifecycle = { command: entry.command, args: entry.args };
  config.mcp_servers = mcpServers;
  writeFile(filePath, TOML.stringify(config) + "\n");
  return "installed";
}

// ---------------------------------------------------------------------------
// Harness registry
// ---------------------------------------------------------------------------

const harnesses: Harness[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    paths: {
      user: path.join(home, ".claude", "settings.json"),
      project: ".mcp.json",
      local: ".claude/settings.local.json",
    },
    install: installJson,
  },
  {
    id: "codex",
    label: "Codex",
    paths: {
      user: path.join(home, ".codex", "config.toml"),
      project: ".codex/config.toml",
    },
    install: installToml,
  },
];

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

const mcpEntry: McpEntry = { command: "lifecycle", args: ["mcp"] };

export default defineCommand({
  description: "Install the Lifecycle MCP server into agent harness configs.",
  input: z.object({
    scope: z
      .enum(["user", "project", "local"])
      .default("project")
      .describe("user (personal, all projects), project (team-shared, committed), or local (personal, this project, gitignored)."),
    force: z.boolean().default(false).describe("Overwrite existing entries."),
  }),
  run: async (input) => {
    const scope = input.scope;
    const available = harnesses.filter((h) => h.paths[scope]);

    if (available.length === 0) {
      log.error(`No harnesses support the "${scope}" scope.`);
      return 1;
    }

    intro("lifecycle mcp install");

    const selected = await multiselect({
      message: `Install into (${scope}):`,
      options: available.map((h) => ({
        value: h.id,
        label: h.label,
        hint: h.paths[scope],
      })),
      initialValues: available.map((h) => h.id),
    });

    if (isCancel(selected)) {
      cancel("Cancelled.");
      return 1;
    }

    for (const id of selected) {
      const harness = available.find((h) => h.id === id)!;
      const configPath = resolvePath(harness.paths[scope]!);
      const result = harness.install(configPath, mcpEntry, input.force);

      if (result === "exists") {
        log.warn(`${harness.label} — already installed`);
      } else {
        log.success(`${harness.label} → ${configPath}`);
      }
    }

    outro("Done.");
    return 0;
  },
});
