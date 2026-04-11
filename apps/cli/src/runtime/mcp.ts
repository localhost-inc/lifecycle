import path from "node:path";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CommandDefinition } from "@localhost-inc/cmd";
import type { z } from "zod";

import { getSchemaShape } from "./schema";
import type { AnyCommandDefinition, CommandRegistry } from "./types";

export interface RunMcpOptions {
  name: string;
  version: string;
  baseDir: string;
  commandExtensions?: string[];
  exclude?: string[];
  registry?: CommandRegistry;
}

type AnyCommand = AnyCommandDefinition;

async function discoverCommands(
  baseDir: string,
  extensions: readonly string[],
): Promise<Map<string, { command: AnyCommand; filePath: string }>> {
  const commands = new Map<string, { command: AnyCommand; filePath: string }>();

  for (const ext of extensions) {
    const glob = new Bun.Glob(`commands/**/*.${ext}`);
    for await (const file of glob.scan({ cwd: baseDir })) {
      const normalized = file.replace(/\\/g, "/");
      const name = normalized.replace(/^commands\//, "").replace(/\.(ts|js)$/, "");

      if (name.split("/").some((segment) => segment.startsWith("_"))) {
        continue;
      }

      const fullPath = path.join(baseDir, normalized);
      const url = pathToFileURL(fullPath).toString();
      const module = await import(url);
      if (!module.default || module.default.kind !== "command") continue;

      commands.set(name, { command: module.default as CommandDefinition<any>, filePath: normalized });
    }
  }

  return commands;
}

async function discoverRegistryCommands(
  registry: CommandRegistry,
): Promise<Map<string, { command: AnyCommand; filePath: string }>> {
  const commands = new Map<string, { command: AnyCommand; filePath: string }>();

  for (const [name, load] of Object.entries(registry)) {
    if (name.split("/").some((segment) => segment.startsWith("_"))) {
      continue;
    }

    commands.set(name, {
      command: await load(),
      filePath: name,
    });
  }

  return commands;
}

function commandPathToToolName(prefix: string, commandPath: string): string {
  return `${prefix}.${commandPath.replace(/\//g, ".")}`;
}

function extractInputSchema(command: AnyCommand): Record<string, z.ZodTypeAny> | null {
  const shape = getSchemaShape(command.input);
  const keys = Object.keys(shape);
  const meaningfulKeys = keys.filter((key) => key !== "json" && key !== "args");

  if (meaningfulKeys.length === 0 && keys.length <= 1) {
    return {};
  }

  const mcpShape: Record<string, z.ZodTypeAny> = {};
  for (const key of keys) {
    if (key === "json") continue;
    mcpShape[key] = shape[key]!;
  }

  return mcpShape;
}

export async function runMcp(options: RunMcpOptions): Promise<void> {
  const extensions = options.commandExtensions ?? ["ts", "js"];
  const exclude = new Set(options.exclude ?? ["mcp"]);
  const commands = options.registry
    ? await discoverRegistryCommands(options.registry)
    : await discoverCommands(options.baseDir, extensions);

  const server = new McpServer({
    name: options.name,
    version: options.version,
  });

  for (const [commandPath, { command }] of commands) {
    if (exclude.has(commandPath)) continue;

    const toolName = commandPathToToolName(options.name, commandPath);
    const description = command.description ?? toolName;
    const inputSchema = extractInputSchema(command);
    if (inputSchema === null) continue;

    server.tool(toolName, description, inputSchema, async (params) => {
      const output: string[] = [];
      const errors: string[] = [];
      const input = { ...params, json: true };
      const parsed = command.input.safeParse(input);

      if (!parsed.success) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: parsed.error.issues
                .map(
                  (issue: { path: (string | number)[]; message: string }) =>
                    `${issue.path.join(".")}: ${issue.message}`,
                )
                .join("\n"),
            },
          ],
        };
      }

      try {
        const code = await command.run(parsed.data, {
          argv: [],
          cliName: options.name,
          commandPath,
          positionals: [],
          stderr: (message) => errors.push(message),
          stdout: (message) => output.push(message),
        });

        const text = output.join("\n") || errors.join("\n") || "(no output)";
        if (code !== 0 && code !== undefined) {
          return { isError: true, content: [{ type: "text" as const, text }] };
        }
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? error.message : String(error),
            },
          ],
        };
      }
    });
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
