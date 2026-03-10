import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonSchema = Record<string, unknown>;

interface BenchmarkTask {
  id: string;
  prompt: string;
  schema: JsonSchema;
}

interface BenchmarkVariant {
  cli: "claude" | "codex";
  description: string;
  id: string;
  extraArgs: (context: BenchmarkContext) => string[];
}

interface BenchmarkContext {
  codexMcpServers: string[];
  repoRoot: string;
  timeoutMs: number;
}

interface BenchmarkRun {
  cli: "claude" | "codex";
  durationMs: number;
  exitCode: number | null;
  id: string;
  logDir: string;
  notes: string[];
  outputText: string;
  parsedOutput: unknown;
  repeat: number;
  signal: NodeJS.Signals | null;
  stderrPath: string;
  stdoutPath: string;
  taskId: string;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const TERMINAL_TITLE_SCHEMA = {
  additionalProperties: false,
  properties: {
    title: { type: "string" },
  },
  required: ["title"],
  type: "object",
} satisfies JsonSchema;

const WORKSPACE_IDENTITY_SCHEMA = {
  additionalProperties: false,
  properties: {
    session_title: { type: "string" },
    workspace_title: { type: "string" },
  },
  required: ["workspace_title", "session_title"],
  type: "object",
} satisfies JsonSchema;

const DEFAULT_PROMPT = "fix tab and branch naming fallback while keeping model startup fast";

const TASKS: readonly BenchmarkTask[] = [
  {
    id: "terminal-title",
    prompt: `Return JSON only.
Create a concise 2-4 word terminal session title for this coding task.
Use plain sentence case text. Capitalize only the first word unless a later word is an acronym or proper noun.
Task: ${DEFAULT_PROMPT}`,
    schema: TERMINAL_TITLE_SCHEMA,
  },
  {
    id: "workspace-identity",
    prompt: `Return JSON only.
Create concise names for a coding workspace from the user's first task prompt.
- workspace_title: 2-4 word durable workspace/worktree/branch identity.
- session_title: 2-4 word terminal session tab title.
Use plain sentence case text. Capitalize only the first word unless a later word is an acronym or proper noun.
Task: ${DEFAULT_PROMPT}`,
    schema: WORKSPACE_IDENTITY_SCHEMA,
  },
];

function readCodexMcpServers(): string[] {
  const configPath = join(homedir(), ".codex", "config.toml");
  if (!existsSync(configPath)) {
    return [];
  }

  const config = readFileSync(configPath, "utf8");
  const names = new Set<string>();

  for (const match of config.matchAll(/^\[mcp_servers\.([^\]\n]+)\]\s*$/gm)) {
    if (match[1]) {
      names.add(match[1]);
    }
  }

  return [...names].sort();
}

function buildCodexNoMcpArgs(serverNames: readonly string[]): string[] {
  const args: string[] = [];

  for (const serverName of serverNames) {
    args.push("-c", `mcp_servers.${serverName}.enabled=false`);
  }

  // codex_apps is not represented in ~/.codex/config.toml, so disable the feature explicitly.
  args.push("-c", "features.apps=false");
  return args;
}

const VARIANTS: readonly BenchmarkVariant[] = [
  {
    cli: "codex",
    description: "Codex using the user's configured defaults",
    extraArgs() {
      return [];
    },
    id: "codex-default",
  },
  {
    cli: "codex",
    description: "Codex with configured MCP servers and codex_apps disabled",
    extraArgs(context) {
      return buildCodexNoMcpArgs(context.codexMcpServers);
    },
    id: "codex-no-mcp",
  },
  {
    cli: "codex",
    description: "Codex with MCP disabled and medium reasoning effort",
    extraArgs(context) {
      return [...buildCodexNoMcpArgs(context.codexMcpServers), "-c", 'model_reasoning_effort="medium"'];
    },
    id: "codex-no-mcp-medium",
  },
  {
    cli: "codex",
    description: "Codex with MCP disabled, medium reasoning effort, and ephemeral sessions",
    extraArgs(context) {
      return [
        ...buildCodexNoMcpArgs(context.codexMcpServers),
        "-c",
        'model_reasoning_effort="medium"',
        "--ephemeral",
      ];
    },
    id: "codex-no-mcp-medium-ephemeral",
  },
  {
    cli: "codex",
    description: "Codex with MCP disabled and low reasoning effort",
    extraArgs(context) {
      return [...buildCodexNoMcpArgs(context.codexMcpServers), "-c", 'model_reasoning_effort="low"'];
    },
    id: "codex-no-mcp-low",
  },
  {
    cli: "claude",
    description: "Claude using the user's configured defaults",
    extraArgs() {
      return [];
    },
    id: "claude-default",
  },
  {
    cli: "claude",
    description: "Claude Sonnet with a strict empty MCP config",
    extraArgs() {
      return [
        "--model",
        "sonnet",
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
      ];
    },
    id: "claude-sonnet-no-mcp",
  },
  {
    cli: "claude",
    description: "Claude Haiku with a strict empty MCP config",
    extraArgs() {
      return [
        "--model",
        "haiku",
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
      ];
    },
    id: "claude-haiku-no-mcp",
  },
  {
    cli: "claude",
    description: "Claude with a strict empty MCP config",
    extraArgs() {
      return ["--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}'];
    },
    id: "claude-no-mcp",
  },
  {
    cli: "claude",
    description: "Claude with MCP disabled and medium effort",
    extraArgs() {
      return ["--effort", "medium", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}'];
    },
    id: "claude-no-mcp-medium",
  },
  {
    cli: "claude",
    description: "Claude with MCP disabled and low effort",
    extraArgs() {
      return ["--effort", "low", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}'];
    },
    id: "claude-no-mcp-low",
  },
];

interface CliOptions {
  keepTemp: boolean;
  repeats: number;
  selectedTaskIds: Set<string> | null;
  selectedVariantIds: Set<string> | null;
  timeoutMs: number;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    keepTemp: false,
    repeats: 1,
    selectedTaskIds: null,
    selectedVariantIds: null,
    timeoutMs: 120_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--keep-temp") {
      options.keepTemp = true;
      continue;
    }

    if (argument === "--repeats") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--repeats requires a value");
      }
      options.repeats = parsePositiveInteger(value, "--repeats");
      index += 1;
      continue;
    }

    if (argument === "--timeout-ms") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--timeout-ms requires a value");
      }
      options.timeoutMs = parsePositiveInteger(value, "--timeout-ms");
      index += 1;
      continue;
    }

    if (argument === "--task") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--task requires a value");
      }

      const taskIds = value === "all" ? [] : value.split(",").map((item) => item.trim());
      options.selectedTaskIds = taskIds.length === 0 ? null : new Set(taskIds);
      index += 1;
      continue;
    }

    if (argument === "--variant") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--variant requires a value");
      }

      const variantIds = value === "all" ? [] : value.split(",").map((item) => item.trim());
      options.selectedVariantIds = variantIds.length === 0 ? null : new Set(variantIds);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function parsePositiveInteger(rawValue: string, flagName: string): number {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flagName} must be a positive integer`);
  }

  return value;
}

function selectTasks(selectedTaskIds: Set<string> | null): readonly BenchmarkTask[] {
  if (!selectedTaskIds) {
    return TASKS;
  }

  const tasks = TASKS.filter((task) => selectedTaskIds.has(task.id));
  if (tasks.length === 0) {
    throw new Error(`No benchmark tasks matched: ${[...selectedTaskIds].join(", ")}`);
  }

  return tasks;
}

function selectVariants(selectedVariantIds: Set<string> | null): readonly BenchmarkVariant[] {
  if (!selectedVariantIds) {
    return VARIANTS;
  }

  const variants = VARIANTS.filter((variant) => selectedVariantIds.has(variant.id));
  if (variants.length === 0) {
    throw new Error(`No benchmark variants matched: ${[...selectedVariantIds].join(", ")}`);
  }

  return variants;
}

function sanitizeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (
      parsed &&
      typeof parsed === "object" &&
      "structured_output" in parsed &&
      parsed.structured_output !== undefined
    ) {
      return parsed.structured_output;
    }

    return parsed;
  } catch {
    return trimmed;
  }
}

function summarizeOutput(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function writeRunArtifacts(
  runDir: string,
  stdout: string,
  stderr: string,
  extraFiles: Record<string, string>,
): { stderrPath: string; stdoutPath: string } {
  mkdirSync(runDir, { recursive: true });
  const stdoutPath = join(runDir, "stdout.log");
  const stderrPath = join(runDir, "stderr.log");
  writeFileSync(stdoutPath, stdout);
  writeFileSync(stderrPath, stderr);

  for (const [fileName, contents] of Object.entries(extraFiles)) {
    writeFileSync(join(runDir, fileName), contents);
  }

  return { stderrPath, stdoutPath };
}

function readCodexOutput(outputPath: string): string {
  if (!existsSync(outputPath)) {
    return "";
  }

  return readFileSync(outputPath, "utf8").trim();
}

function runCodexBenchmark(
  context: BenchmarkContext,
  task: BenchmarkTask,
  variant: BenchmarkVariant,
  repeat: number,
  tempRoot: string,
): BenchmarkRun {
  const runDir = join(tempRoot, `${sanitizeFileSegment(variant.id)}-${sanitizeFileSegment(task.id)}-${repeat}`);
  const schemaPath = join(runDir, "schema.json");
  const outputPath = join(runDir, "last-message.txt");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(schemaPath, JSON.stringify(task.schema));

  const args = [
    "exec",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--color",
    "never",
    ...variant.extraArgs(context),
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputPath,
    task.prompt,
  ];

  const startedAt = Date.now();
  const result = spawnSync("codex", args, {
    cwd: context.repoRoot,
    encoding: "utf8",
    timeout: context.timeoutMs,
  });
  const durationMs = Date.now() - startedAt;

  const outputText = readCodexOutput(outputPath);
  const { stderrPath, stdoutPath } = writeRunArtifacts(runDir, result.stdout, result.stderr, {
    "args.json": JSON.stringify(args, null, 2),
    "output.txt": outputText,
  });
  const notes: string[] = [];
  const timedOut = result.error?.name === "TimeoutError";
  if (timedOut) {
    notes.push("timed out");
  }
  if (result.error && !timedOut) {
    notes.push(result.error.message);
  }

  return {
    cli: "codex",
    durationMs,
    exitCode: result.status,
    id: variant.id,
    logDir: runDir,
    notes,
    outputText,
    parsedOutput: tryParseJson(outputText),
    repeat,
    signal: result.signal,
    stderrPath,
    stdoutPath,
    taskId: task.id,
  };
}

function runClaudeBenchmark(
  context: BenchmarkContext,
  task: BenchmarkTask,
  variant: BenchmarkVariant,
  repeat: number,
  tempRoot: string,
): BenchmarkRun {
  const runDir = join(tempRoot, `${sanitizeFileSegment(variant.id)}-${sanitizeFileSegment(task.id)}-${repeat}`);
  const args = [
    "-p",
    "--tools",
    "",
    "--permission-mode",
    "bypassPermissions",
    "--no-session-persistence",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(task.schema),
    ...variant.extraArgs(context),
    "--",
    task.prompt,
  ];

  const startedAt = Date.now();
  const result = spawnSync("claude", args, {
    cwd: context.repoRoot,
    encoding: "utf8",
    timeout: context.timeoutMs,
  });
  const durationMs = Date.now() - startedAt;
  const outputText = result.stdout.trim();

  const { stderrPath, stdoutPath } = writeRunArtifacts(runDir, result.stdout, result.stderr, {
    "args.json": JSON.stringify(args, null, 2),
  });
  const notes: string[] = [];
  const timedOut = result.error?.name === "TimeoutError";
  if (timedOut) {
    notes.push("timed out");
  }
  if (result.error && !timedOut) {
    notes.push(result.error.message);
  }

  return {
    cli: "claude",
    durationMs,
    exitCode: result.status,
    id: variant.id,
    logDir: runDir,
    notes,
    outputText,
    parsedOutput: tryParseJson(outputText),
    repeat,
    signal: result.signal,
    stderrPath,
    stdoutPath,
    taskId: task.id,
  };
}

function summarizeRun(run: BenchmarkRun): Record<string, string | number> {
  return {
    cli: run.cli,
    duration_ms: run.durationMs,
    exit_code: run.exitCode ?? -1,
    notes: run.notes.join("; "),
    output: summarizeOutput(run.parsedOutput),
    repeat: run.repeat,
    task: run.taskId,
    variant: run.id,
  };
}

function printUsage(): void {
  console.log(`Usage: bun run scripts/benchmark-naming-models.ts [options]

Options:
  --repeats <n>       Number of times to run each task/variant pair (default: 1)
  --task <ids>        Comma-separated task ids or "all"
  --variant <ids>     Comma-separated variant ids or "all"
  --timeout-ms <n>    Per-run timeout in milliseconds (default: 120000)
  --keep-temp         Keep the generated temp directory instead of deleting it

Tasks:
  ${TASKS.map((task) => task.id).join(", ")}

Variants:
  ${VARIANTS.map((variant) => variant.id).join(", ")}
`);
}

function main(): void {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const options = parseArgs(process.argv.slice(2));
  const tasks = selectTasks(options.selectedTaskIds);
  const variants = selectVariants(options.selectedVariantIds);
  const tempRoot = mkdtempSync(join(tmpdir(), "lifecycle-naming-bench-"));
  const context: BenchmarkContext = {
    codexMcpServers: readCodexMcpServers(),
    repoRoot,
    timeoutMs: options.timeoutMs,
  };

  const runs: BenchmarkRun[] = [];

  console.log(`Benchmark temp directory: ${tempRoot}`);
  console.log(`Codex MCP servers discovered: ${context.codexMcpServers.join(", ") || "(none)"}`);
  console.log(
    `Selected variants: ${variants.map((variant) => variant.id).join(", ")}`,
  );
  console.log(`Selected tasks: ${tasks.map((task) => task.id).join(", ")}`);
  console.log("");

  try {
    for (const task of tasks) {
      console.log(`Task: ${task.id}`);
      for (const variant of variants) {
        console.log(`  Running ${variant.id}: ${variant.description}`);
        for (let repeat = 1; repeat <= options.repeats; repeat += 1) {
          const run =
            variant.cli === "codex"
              ? runCodexBenchmark(context, task, variant, repeat, tempRoot)
              : runClaudeBenchmark(context, task, variant, repeat, tempRoot);
          runs.push(run);
        }
      }
      console.log("");
    }

    writeFileSync(join(tempRoot, "results.json"), JSON.stringify(runs, null, 2));
    console.table(runs.map(summarizeRun));
    console.log(`Detailed artifacts written to ${tempRoot}`);
  } finally {
    if (!options.keepTemp) {
      rmSync(tempRoot, { force: true, recursive: true });
      console.log("Temp artifacts removed. Re-run with --keep-temp to inspect raw logs.");
    }
  }
}

main();
