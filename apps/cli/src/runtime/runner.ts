import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  formatCommandHelp,
  formatNamespaceHelp,
  getCommandAliases,
  parseFlags,
  type CommandDefinition,
  type CommandIo,
} from "@localhost-inc/cmd";
import { ZodError } from "zod";

import { runMcp } from "./mcp";
import { getSchemaShape } from "./schema";
import type { AnyCommandDefinition, CommandRegistry } from "./types";

export type RunCliOptions = {
  name: string;
  baseDir: string;
  argv?: string[];
  commandExtensions?: string[];
  io?: CliIo;
  registry?: CommandRegistry;
  mcp?: { version: string };
};

export type CliIo = CommandIo;

type AnyCommand = AnyCommandDefinition;

type CommandMatch = {
  command: AnyCommand;
  depth: number;
  path: string;
};

type ChildEntry = {
  description?: string;
  name: string;
};

interface CommandSource {
  index: Set<string>;
  load: (commandPath: string) => Promise<AnyCommand>;
}

let commandIndex: Map<string, Set<string>> = new Map();

const defaultIo: CliIo = {
  stderr: (message) => console.error(message),
  stdout: (message) => console.log(message),
};

async function getFilesystemCommandIndex(
  baseDir: string,
  commandExtensions: readonly string[],
): Promise<Set<string>> {
  const key = `${baseDir}:${commandExtensions.join(",")}`;
  const cached = commandIndex.get(key);
  if (cached) return cached;

  const index = new Set<string>();
  for (const extension of commandExtensions) {
    const glob = new Bun.Glob(`commands/**/*.${extension}`);
    for await (const file of glob.scan({ cwd: baseDir })) {
      const normalized = file.replace(/\\/g, "/");
      const commandPath = normalized.replace(/^commands\//, "").replace(/\.(ts|js)$/, "");
      if (commandPath.split("/").some((segment) => isPrivateModuleName(segment))) {
        continue;
      }
      index.add(commandPath);
    }
  }

  commandIndex.set(key, index);
  return index;
}

function splitArgs(args: string[]) {
  const segments: string[] = [];
  const flagArgs: string[] = [];
  let sawFlag = false;

  for (const arg of args) {
    if (!sawFlag && (arg === "--" || arg.startsWith("-"))) {
      sawFlag = true;
    }

    if (sawFlag) {
      flagArgs.push(arg);
    } else {
      segments.push(arg);
    }
  }

  return { segments, flagArgs };
}

async function importCommand(baseDir: string, relativePath: string): Promise<AnyCommand> {
  const fullPath = path.join(baseDir, relativePath);
  const url = pathToFileURL(fullPath).toString();
  const module = await import(url);
  if (!module.default) {
    throw new Error(`Command module "${relativePath}" has no default export.`);
  }
  return module.default as CommandDefinition<any>;
}

function isPrivateModuleName(name: string): boolean {
  return name.startsWith("_");
}

async function importFilesystemCommand(
  baseDir: string,
  commandPath: string,
  commandExtensions: readonly string[],
): Promise<AnyCommand> {
  for (const extension of commandExtensions) {
    const relativePath = `commands/${commandPath}.${extension}`;
    try {
      return await importCommand(baseDir, relativePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Command module "${commandPath}" could not be resolved.`);
}

function findCommandPath(
  segments: string[],
  index: Set<string>,
): { commandPath: string; depth: number } | null {
  for (let depth = segments.length; depth > 0; depth -= 1) {
    const commandPath = segments.slice(0, depth).join("/");
    if (commandPath.split("/").some((segment) => isPrivateModuleName(segment))) {
      continue;
    }
    if (index.has(commandPath)) {
      return { commandPath, depth };
    }
  }

  return null;
}

function printZodError(error: ZodError, io: CliIo) {
  io.stderr("Invalid arguments:");
  for (const issue of error.issues) {
    const issuePath = issue.path.length > 0 ? issue.path.join(".") : "args";
    io.stderr(`- ${issuePath}: ${issue.message}`);
  }
}

function hasHelpAlias(command: AnyCommand): boolean {
  return getCommandAliases(command).has("h");
}

function isHelpRequested(flagArgs: string[], command: AnyCommand): boolean {
  const hasLongHelp = flagArgs.some((arg) => arg === "--help" || arg.startsWith("--help="));
  if (hasLongHelp) return true;
  const hasShortHelp = flagArgs.some((arg) => arg === "-h" || arg.startsWith("-h="));
  if (!hasShortHelp) return false;
  return !hasHelpAlias(command);
}

function commandAcceptsPositionals(command: AnyCommand): boolean {
  return "args" in getSchemaShape(command.input);
}

function namespaceExists(index: Set<string>, commandPath: string | null): boolean {
  const prefix = commandPath ? `${commandPath.replace(/ /g, "/")}/` : "";
  for (const entry of index) {
    if (entry.startsWith(prefix) && (!commandPath || entry !== commandPath)) {
      return true;
    }
  }

  return false;
}

async function listChildEntries(
  source: CommandSource,
  commandPath: string | null,
): Promise<ChildEntry[]> {
  const prefix = commandPath ? `${commandPath.replace(/ /g, "/")}/` : "";
  const childEntriesByName = new Map<string, ChildEntry>();

  for (const entry of source.index) {
    if (commandPath && !entry.startsWith(prefix)) {
      continue;
    }

    const remainder = commandPath ? entry.slice(prefix.length) : entry;
    if (!remainder) {
      continue;
    }

    const [head = ""] = remainder.split("/", 1);
    if (!head) {
      continue;
    }

    if (remainder.includes("/")) {
      if (!childEntriesByName.has(head)) {
        childEntriesByName.set(head, { name: head });
      }
      continue;
    }

    const childCommandPath = commandPath ? `${commandPath}/${head}` : head;
    const command = await source.load(childCommandPath);
    childEntriesByName.set(
      head,
      command.description ? { description: command.description, name: head } : { name: head },
    );
  }

  return [...childEntriesByName.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

async function resolveCommand(
  segments: string[],
  source: CommandSource,
): Promise<CommandMatch | null> {
  const commandMatch = findCommandPath(segments, source.index);
  if (!commandMatch) {
    return null;
  }

  const command = await source.load(commandMatch.commandPath);
  return {
    command,
    depth: commandMatch.depth,
    path: segments.slice(0, commandMatch.depth).join(" "),
  };
}

function resolveNamespaceDepth(segments: string[], index: Set<string>): number {
  for (let depth = segments.length; depth >= 0; depth -= 1) {
    const commandPath = depth === 0 ? null : segments.slice(0, depth).join(" ");
    if (namespaceExists(index, commandPath)) {
      return depth;
    }
  }

  return -1;
}

function createRegistryCommandSource(registry: CommandRegistry): CommandSource {
  const index = new Set(Object.keys(registry));
  return {
    index,
    load: async (commandPath) => {
      const loader = registry[commandPath];
      if (!loader) {
        throw new Error(`Command module "${commandPath}" could not be resolved.`);
      }
      return await loader();
    },
  };
}

function createFilesystemCommandSource(
  baseDir: string,
  commandExtensions: readonly string[],
  index: Set<string>,
): CommandSource {
  return {
    index,
    load: async (commandPath) =>
      await importFilesystemCommand(baseDir, commandPath, commandExtensions),
  };
}

async function createCommandSource(
  options: Pick<RunCliOptions, "baseDir" | "commandExtensions" | "registry">,
): Promise<CommandSource> {
  if (options.registry) {
    return createRegistryCommandSource(options.registry);
  }

  const commandExtensions = options.commandExtensions ?? ["ts", "js"];
  const index = await getFilesystemCommandIndex(options.baseDir, commandExtensions);
  return createFilesystemCommandSource(options.baseDir, commandExtensions, index);
}

export async function runCli(options: RunCliOptions): Promise<number> {
  const argv = options.argv ?? Bun.argv.slice(2);
  const io = options.io ?? defaultIo;
  const { segments, flagArgs } = splitArgs(argv);

  if (options.mcp && segments.length === 1 && segments[0] === "mcp") {
    await runMcp({
      name: options.name,
      version: options.mcp.version,
      baseDir: options.baseDir,
      ...(options.commandExtensions ? { commandExtensions: options.commandExtensions } : {}),
      ...(options.registry ? { registry: options.registry } : {}),
    });
    await new Promise(() => {});
    return 0;
  }

  const source = await createCommandSource(options);
  const namespaceDepth = resolveNamespaceDepth(segments, source.index);
  const commandMatch = await resolveCommand(segments, source);
  const shouldRenderNamespace = namespaceDepth >= 0 && (!commandMatch || namespaceDepth >= commandMatch.depth);

  if (shouldRenderNamespace) {
    const namespacePath = namespaceDepth === 0 ? null : segments.slice(0, namespaceDepth).join(" ");
    const remainingSegments = segments.slice(namespaceDepth);

    if (remainingSegments.length > 0) {
      io.stderr(`Unknown command: ${options.name} ${segments.join(" ")}`);
      return 1;
    }

    if (
      flagArgs.length > 0 &&
      !flagArgs.every(
        (arg) =>
          arg === "--help" || arg === "-h" || arg.startsWith("--help=") || arg.startsWith("-h="),
      )
    ) {
      io.stderr(`Unknown command: ${options.name} ${segments.join(" ")}`);
      return 1;
    }

    const childEntries = await listChildEntries(source, namespacePath);
    io.stdout(formatNamespaceHelp(options.name, namespacePath, childEntries));
    return 0;
  }

  if (!commandMatch) {
    io.stderr(`Unknown command: ${options.name} ${segments.join(" ")}`);
    return 1;
  }

  const positionals = segments.slice(commandMatch.depth);

  if (
    positionals.length > 0 &&
    !commandAcceptsPositionals(commandMatch.command) &&
    namespaceExists(source.index, commandMatch.path)
  ) {
    io.stderr(`Unknown command: ${options.name} ${segments.join(" ")}`);
    return 1;
  }

  if (isHelpRequested(flagArgs, commandMatch.command)) {
    io.stdout(formatCommandHelp(options.name, commandMatch.path || null, commandMatch.command));
    return 0;
  }

  let parsedInput: Record<string, unknown>;

  try {
    const parsed = parseFlags(flagArgs, commandMatch.command.input, {
      positionals,
    });
    parsedInput = parsed.data;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const result = commandMatch.command.input.safeParse(parsedInput);
  if (!result.success) {
    printZodError(result.error, io);
    return 1;
  }

  try {
    return (
      (await commandMatch.command.run(result.data, {
        argv,
        cliName: options.name,
        commandPath: commandMatch.path || null,
        positionals,
        stderr: io.stderr,
        stdout: io.stdout,
      })) ?? 0
    );
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
