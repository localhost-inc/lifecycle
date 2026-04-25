import fs from "node:fs";
import path from "node:path";
import TOML from "smol-toml";
import type { TomlTable } from "smol-toml";

import { LifecycleCliError } from "../errors";

export type HookInstallStatus = "created" | "updated" | "unchanged";
export type HookCheckStatus = "installed" | "missing" | "outdated";

type HookTargetFormat = "javascript" | "json" | "script" | "toml";
type HookTargetIntegration = "hook-adapter" | "hook-features" | "hooks" | "opencode-plugin";

type HookHandler = Record<string, unknown> & {
  command: string;
  type: "command";
};

type HookGroup = {
  hooks: HookHandler[];
  matcher?: string;
};

interface HookTargetSpec {
  format: HookTargetFormat;
  harness_id: string;
  integration: HookTargetIntegration;
  label: string;
  path: string;
}

export interface ResolvedHookTarget extends HookTargetSpec {
  scope: "project";
}

const ACTIVITY_HOOK_SCRIPT_PATH = path.join(".lifecycle", "hooks", "activity.sh");

const ACTIVITY_HOOK_SCRIPT = `#!/bin/sh
set -eu

if [ -z "\${LIFECYCLE_WORKSPACE_ID:-}" ]; then
  exit 0
fi

terminal_id="\${LIFECYCLE_TERMINAL_ID:-}"
if [ -z "$terminal_id" ] && command -v tmux >/dev/null 2>&1 && [ -n "\${TMUX_PANE:-}" ]; then
  terminal_id="$(tmux display-message -p -t "$TMUX_PANE" '#{window_id}' 2>/dev/null || true)"
fi

if [ -z "$terminal_id" ]; then
  exit 0
fi

cli_bin="\${LIFECYCLE_CLI_BIN:-lifecycle}"
"$cli_bin" workspace activity emit "$@" --terminal-id "$terminal_id" >/dev/null 2>&1 || exit 0
`;

const OPENCODE_ACTIVITY_PLUGIN = `const resolveTerminalId = async () => {
  if (process.env.LIFECYCLE_TERMINAL_ID) {
    return process.env.LIFECYCLE_TERMINAL_ID
  }
  if (!process.env.TMUX_PANE) {
    return null
  }
  try {
    const { execFile } = await import("node:child_process")
    return await new Promise((resolve) => {
      execFile(
        "tmux",
        ["display-message", "-p", "-t", process.env.TMUX_PANE, "#{window_id}"],
        { timeout: 1000 },
        (error, stdout) => {
          if (error) {
            resolve(null)
            return
          }
          const id = stdout.trim()
          resolve(id.length > 0 ? id : null)
        },
      )
    })
  } catch {
    return null
  }
}

const pickText = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value
    }
  }
  return null
}

const runLifecycleActivity = async (...args) => {
  if (!process.env.LIFECYCLE_WORKSPACE_ID) {
    return
  }
  const terminalId = await resolveTerminalId()
  if (!terminalId) {
    return
  }
  const { spawn } = await import("node:child_process")
  const command = process.env.LIFECYCLE_CLI_BIN || "lifecycle"
  const child = spawn(command, [
    "workspace",
    "activity",
    "emit",
    ...args,
    "--terminal-id",
    terminalId,
  ], {
    detached: true,
    stdio: "ignore",
  })
  child.unref()
}

const sessionIDFrom = (input) =>
  pickText(input?.sessionID, input?.session?.id, input?.session?.sessionID, input?.properties?.sessionID)

const toolNameFrom = (input, output) =>
  pickText(input?.tool, input?.toolID, input?.name, output?.tool, output?.toolID, output?.name)

const emitTurnStarted = async (input) => {
  const args = ["turn.started", "--provider", "opencode"]
  const sessionID = sessionIDFrom(input)
  if (sessionID) {
    args.push("--turn-id", sessionID)
  }
  await runLifecycleActivity(...args)
}

export const LifecycleActivityPlugin = async () => ({
  "session.status": async (input) => {
    const status = pickText(input?.status, input?.session?.status, input?.properties?.status)
    if (status === "busy" || status === "running") {
      await emitTurnStarted(input)
    }
  },
  "session.idle": async (input) => {
    const args = ["turn.completed", "--provider", "opencode"]
    const sessionID = sessionIDFrom(input)
    if (sessionID) {
      args.push("--turn-id", sessionID)
    }
    await runLifecycleActivity(...args)
  },
  "tool.execute.before": async (input, output) => {
    const args = ["tool_call.started", "--provider", "opencode"]
    const name = toolNameFrom(input, output)
    if (name) {
      args.push("--name", name)
    }
    await runLifecycleActivity(...args)
  },
  "tool.execute.after": async (input, output) => {
    const args = ["tool_call.completed", "--provider", "opencode"]
    const name = toolNameFrom(input, output)
    if (name) {
      args.push("--name", name)
    }
    await runLifecycleActivity(...args)
  },
})
`;

function createHookHandler(command: string): HookHandler {
  return {
    command,
    type: "command",
  };
}

const CLAUDE_ACTIVITY_COMMAND = `sh "\${CLAUDE_PROJECT_DIR}/.lifecycle/hooks/activity.sh"`;
const CODEX_ACTIVITY_COMMAND = `sh "$(git rev-parse --show-toplevel)/.lifecycle/hooks/activity.sh"`;

// Harness hook names are provider-native adapter details. Keep the installed
// commands pointed at Lifecycle's semantic activity events so bridge consumers
// can stay cross-harness and ACP-oriented.
const HOOK_FILE_TARGETS: readonly HookTargetSpec[] = [
  {
    format: "script",
    harness_id: "lifecycle",
    integration: "hook-adapter",
    label: "Lifecycle hook adapter",
    path: ACTIVITY_HOOK_SCRIPT_PATH,
  },
  {
    format: "json",
    harness_id: "claude-code",
    integration: "hooks",
    label: "Claude Code hooks",
    path: path.join(".claude", "settings.json"),
  },
  {
    format: "toml",
    harness_id: "codex",
    integration: "hook-features",
    label: "Codex hook features",
    path: path.join(".codex", "config.toml"),
  },
  {
    format: "json",
    harness_id: "codex",
    integration: "hooks",
    label: "Codex hooks",
    path: path.join(".codex", "hooks.json"),
  },
  {
    format: "javascript",
    harness_id: "opencode",
    integration: "opencode-plugin",
    label: "OpenCode activity plugin",
    path: path.join(".opencode", "plugins", "lifecycle-activity.js"),
  },
] as const;

const CLAUDE_HOOKS: Record<string, HookGroup[]> = {
  PostToolUse: [
    {
      hooks: [
        createHookHandler(
          `${CLAUDE_ACTIVITY_COMMAND} tool_call.completed --provider claude-code --name Bash`,
        ),
      ],
      matcher: "Bash",
    },
  ],
  PreToolUse: [
    {
      hooks: [
        createHookHandler(
          `${CLAUDE_ACTIVITY_COMMAND} tool_call.started --provider claude-code --name Bash`,
        ),
      ],
      matcher: "Bash",
    },
  ],
  Stop: [
    {
      hooks: [
        createHookHandler(`${CLAUDE_ACTIVITY_COMMAND} turn.completed --provider claude-code`),
      ],
    },
  ],
  UserPromptSubmit: [
    {
      hooks: [createHookHandler(`${CLAUDE_ACTIVITY_COMMAND} turn.started --provider claude-code`)],
    },
  ],
};

const CODEX_HOOKS: Record<string, HookGroup[]> = {
  PostToolUse: [
    {
      hooks: [
        createHookHandler(
          `${CODEX_ACTIVITY_COMMAND} tool_call.completed --provider codex --name Bash`,
        ),
      ],
      matcher: "Bash",
    },
  ],
  PreToolUse: [
    {
      hooks: [
        createHookHandler(
          `${CODEX_ACTIVITY_COMMAND} tool_call.started --provider codex --name Bash`,
        ),
      ],
      matcher: "Bash",
    },
  ],
  Stop: [
    {
      hooks: [createHookHandler(`${CODEX_ACTIVITY_COMMAND} turn.completed --provider codex`)],
    },
  ],
  UserPromptSubmit: [
    {
      hooks: [createHookHandler(`${CODEX_ACTIVITY_COMMAND} turn.started --provider codex`)],
    },
  ],
};

export function resolveHookTargets(repoPath: string): ResolvedHookTarget[] {
  return HOOK_FILE_TARGETS.map((target) => ({
    ...target,
    path: path.join(repoPath, target.path),
    scope: "project",
  }));
}

export function checkHookTarget(target: ResolvedHookTarget): HookCheckStatus {
  switch (target.integration) {
    case "hook-adapter":
      return evaluateScriptTarget(target.path).status;
    case "hooks":
      return evaluateHookJsonTarget(target).status;
    case "hook-features":
      return evaluateCodexFeatureTarget(target.path).status;
    case "opencode-plugin":
      return evaluateStaticScriptTarget(target.path, OPENCODE_ACTIVITY_PLUGIN).status;
  }
}

export function installHookTarget(target: ResolvedHookTarget): HookInstallStatus {
  switch (target.integration) {
    case "hook-adapter":
      return installScriptTarget(target.path);
    case "hooks":
      return installHookJsonTarget(target);
    case "hook-features":
      return installCodexFeatureTarget(target.path);
    case "opencode-plugin":
      return installStaticScriptTarget(target.path, OPENCODE_ACTIVITY_PLUGIN);
  }
}

function installScriptTarget(filePath: string): HookInstallStatus {
  const snapshot = evaluateScriptTarget(filePath);
  if (!snapshot.nextContent) {
    return "unchanged";
  }

  writeFile(filePath, snapshot.nextContent);
  return snapshot.fileExists ? "updated" : "created";
}

function installStaticScriptTarget(filePath: string, content: string): HookInstallStatus {
  const snapshot = evaluateStaticScriptTarget(filePath, content);
  if (!snapshot.nextContent) {
    return "unchanged";
  }

  writeFile(filePath, snapshot.nextContent);
  return snapshot.fileExists ? "updated" : "created";
}

function evaluateStaticScriptTarget(
  filePath: string,
  content: string,
): {
  fileExists: boolean;
  nextContent: string | null;
  status: HookCheckStatus;
} {
  const raw = readFileOrNull(filePath);
  if (raw === content) {
    return {
      fileExists: raw !== null,
      nextContent: null,
      status: "installed",
    };
  }

  return {
    fileExists: raw !== null,
    nextContent: content,
    status: raw === null ? "missing" : "outdated",
  };
}

function evaluateScriptTarget(filePath: string): {
  fileExists: boolean;
  nextContent: string | null;
  status: HookCheckStatus;
} {
  const raw = readFileOrNull(filePath);
  if (raw === ACTIVITY_HOOK_SCRIPT) {
    return {
      fileExists: raw !== null,
      nextContent: null,
      status: "installed",
    };
  }

  return {
    fileExists: raw !== null,
    nextContent: ACTIVITY_HOOK_SCRIPT,
    status: raw === null ? "missing" : "outdated",
  };
}

function installHookJsonTarget(target: ResolvedHookTarget): HookInstallStatus {
  const snapshot = evaluateHookJsonTarget(target);
  if (!snapshot.nextContent) {
    return "unchanged";
  }

  writeFile(target.path, snapshot.nextContent);
  return snapshot.fileExists ? "updated" : "created";
}

function evaluateHookJsonTarget(target: ResolvedHookTarget): {
  fileExists: boolean;
  nextContent: string | null;
  status: HookCheckStatus;
} {
  const raw = readFileOrNull(target.path);
  const config = raw ? parseJsonObject(target.path, raw) : {};
  const hooks = readJsonObjectField(target.path, config, "hooks") ?? {};
  const desiredHooks = target.harness_id === "claude-code" ? CLAUDE_HOOKS : CODEX_HOOKS;
  const merge = mergeHookConfig(target.path, hooks, desiredHooks);
  if (!merge.changed) {
    return {
      fileExists: raw !== null,
      nextContent: null,
      status: "installed",
    };
  }

  const nextConfig = {
    ...config,
    hooks: merge.hooks,
  };

  return {
    fileExists: raw !== null,
    nextContent: `${JSON.stringify(nextConfig, null, 2)}\n`,
    status: merge.hasManagedHook ? "outdated" : "missing",
  };
}

function mergeHookConfig(
  filePath: string,
  existingHooks: Record<string, unknown>,
  desiredHooks: Record<string, HookGroup[]>,
): {
  changed: boolean;
  hasManagedHook: boolean;
  hooks: Record<string, unknown>;
} {
  let changed = false;
  let hasManagedHook = false;
  const nextHooks: Record<string, unknown> = { ...existingHooks };

  for (const [eventName, desiredGroups] of Object.entries(desiredHooks)) {
    const currentGroups = readHookGroups(filePath, existingHooks, eventName);
    if (currentGroups.some((group) => group.hooks.some(isManagedActivityHook))) {
      hasManagedHook = true;
    }

    const mergeResult = mergeHookGroups(currentGroups, desiredGroups);
    if (mergeResult.changed) {
      changed = true;
    }
    if (mergeResult.hasManagedHook) {
      hasManagedHook = true;
    }
    nextHooks[eventName] = mergeResult.groups;
  }

  return {
    changed,
    hasManagedHook,
    hooks: nextHooks,
  };
}

function mergeHookGroups(
  currentGroups: HookGroup[],
  desiredGroups: HookGroup[],
): {
  changed: boolean;
  groups: HookGroup[];
  hasManagedHook: boolean;
} {
  let changed = false;
  let hasManagedHook = currentGroups.some((group) => group.hooks.some(isManagedActivityHook));
  const groups = currentGroups.map((group) => ({
    ...group,
    hooks: [...group.hooks],
  }));

  for (const desiredGroup of desiredGroups) {
    const matcher = desiredGroup.matcher;
    const groupIndex = groups.findIndex(
      (group) => normalizeMatcher(group.matcher) === normalizeMatcher(matcher),
    );
    if (groupIndex === -1) {
      groups.push({
        ...(matcher ? { matcher } : {}),
        hooks: desiredGroup.hooks.map((hook) => ({ ...hook })),
      });
      changed = true;
      continue;
    }

    const group = groups[groupIndex]!;
    for (const desiredHook of desiredGroup.hooks) {
      const hookIndex = group.hooks.findIndex(isManagedActivityHook);
      if (hookIndex === -1) {
        if (
          !group.hooks.some(
            (hook) => hook.command === desiredHook.command && hook.type === desiredHook.type,
          )
        ) {
          group.hooks.push({ ...desiredHook });
          changed = true;
        }
        continue;
      }

      hasManagedHook = true;
      if (!hookHandlersEqual(group.hooks[hookIndex]!, desiredHook)) {
        group.hooks[hookIndex] = { ...desiredHook };
        changed = true;
      }
    }
  }

  return {
    changed,
    groups,
    hasManagedHook,
  };
}

function normalizeMatcher(value: string | undefined): string | null {
  return value === undefined ? null : value;
}

function hookHandlersEqual(left: HookHandler, right: HookHandler): boolean {
  return left.command === right.command && left.type === right.type;
}

function isManagedActivityHook(value: unknown): value is HookHandler {
  return (
    isRecord(value) &&
    value.type === "command" &&
    typeof value.command === "string" &&
    value.command.includes("/.lifecycle/hooks/activity.sh")
  );
}

function readHookGroups(
  filePath: string,
  hooks: Record<string, unknown>,
  eventName: string,
): HookGroup[] {
  const value = hooks[eventName];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new LifecycleCliError({
      code: "config_invalid",
      details: { eventName, filePath },
      message: `Lifecycle expected hooks.${eventName} in ${filePath} to be an array.`,
      suggestedAction: "Fix the invalid hook config manually, then retry the install.",
    });
  }

  return value.map((group, index) => parseHookGroup(filePath, eventName, index, group));
}

function parseHookGroup(
  filePath: string,
  eventName: string,
  index: number,
  value: unknown,
): HookGroup {
  if (!isRecord(value)) {
    throw new LifecycleCliError({
      code: "config_invalid",
      details: { eventName, filePath, index },
      message: `Lifecycle expected hooks.${eventName}[${index}] in ${filePath} to be an object.`,
      suggestedAction: "Fix the invalid hook config manually, then retry the install.",
    });
  }

  const hooks = value.hooks;
  if (!Array.isArray(hooks)) {
    throw new LifecycleCliError({
      code: "config_invalid",
      details: { eventName, filePath, index },
      message: `Lifecycle expected hooks.${eventName}[${index}].hooks in ${filePath} to be an array.`,
      suggestedAction: "Fix the invalid hook config manually, then retry the install.",
    });
  }

  const parsedHooks = hooks.map((hook, hookIndex) =>
    parseHookHandler(filePath, eventName, index, hookIndex, hook),
  );
  const matcher = value.matcher;
  if (matcher !== undefined && typeof matcher !== "string") {
    throw new LifecycleCliError({
      code: "config_invalid",
      details: { eventName, filePath, index },
      message: `Lifecycle expected hooks.${eventName}[${index}].matcher in ${filePath} to be a string when present.`,
      suggestedAction: "Fix the invalid hook config manually, then retry the install.",
    });
  }

  return {
    hooks: parsedHooks,
    ...(matcher ? { matcher } : {}),
  };
}

function parseHookHandler(
  filePath: string,
  eventName: string,
  groupIndex: number,
  hookIndex: number,
  value: unknown,
): HookHandler {
  if (!isRecord(value)) {
    throw new LifecycleCliError({
      code: "config_invalid",
      details: { eventName, filePath, groupIndex, hookIndex },
      message: `Lifecycle expected hooks.${eventName}[${groupIndex}].hooks[${hookIndex}] in ${filePath} to be an object.`,
      suggestedAction: "Fix the invalid hook config manually, then retry the install.",
    });
  }

  if (value.type !== "command" || typeof value.command !== "string") {
    throw new LifecycleCliError({
      code: "config_invalid",
      details: { eventName, filePath, groupIndex, hookIndex },
      message: `Lifecycle expected hooks.${eventName}[${groupIndex}].hooks[${hookIndex}] in ${filePath} to be a command hook.`,
      suggestedAction: "Fix the invalid hook config manually, then retry the install.",
    });
  }

  return {
    ...value,
    command: value.command,
    type: "command",
  };
}

function installCodexFeatureTarget(filePath: string): HookInstallStatus {
  const snapshot = evaluateCodexFeatureTarget(filePath);
  if (!snapshot.nextContent) {
    return "unchanged";
  }

  writeFile(filePath, snapshot.nextContent);
  return snapshot.fileExists ? "updated" : "created";
}

function evaluateCodexFeatureTarget(filePath: string): {
  fileExists: boolean;
  nextContent: string | null;
  status: HookCheckStatus;
} {
  const raw = readFileOrNull(filePath);
  const config = raw ? parseTomlTable(filePath, raw) : {};
  const features = readTomlTableField(filePath, config, "features");
  if (features?.codex_hooks === true) {
    return {
      fileExists: raw !== null,
      nextContent: null,
      status: "installed",
    };
  }

  const mergedFeatures = features
    ? ({
        ...features,
        codex_hooks: true,
      } satisfies TomlTable)
    : ({
        codex_hooks: true,
      } satisfies TomlTable);

  return {
    fileExists: raw !== null,
    nextContent: upsertTomlTableBlock(filePath, raw ?? "", "features", mergedFeatures),
    status: features ? "outdated" : "missing",
  };
}

function upsertTomlTableBlock(
  filePath: string,
  raw: string,
  tableName: string,
  values: TomlTable,
): string {
  const lines = splitLines(raw);
  const escapedTableName = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerPattern = new RegExp(`^\\s*\\[${escapedTableName}\\]\\s*$`);
  const headerIndex = lines.findIndex((line) => headerPattern.test(line));
  if (headerIndex === -1) {
    const block = renderTomlTableBlock(tableName, values);
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
  const headerLine = blockLines[0] ?? `[${tableName}]`;
  const managedKeys = new Set(Object.keys(values));
  const bodyLines = blockLines.slice(1).filter((line) => {
    const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/);
    return !match || !managedKeys.has(match[1]!);
  });
  const trailingBlankLines: string[] = [];
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1]?.trim() === "") {
    trailingBlankLines.unshift(bodyLines.pop()!);
  }

  const rewrittenBlock = [
    headerLine,
    ...bodyLines,
    ...Object.entries(values).map(([key, value]) => renderTomlAssignment(key, value)),
    ...trailingBlankLines,
  ];

  return [...lines.slice(0, headerIndex), ...rewrittenBlock, ...lines.slice(nextHeaderIndex)].join(
    "\n",
  );
}

function renderTomlTableBlock(tableName: string, values: TomlTable): string {
  return `${TOML.stringify({
    [tableName]: values,
  }).trimEnd()}\n`;
}

function renderTomlAssignment(key: string, value: unknown): string {
  return TOML.stringify({ [key]: value }).trimEnd();
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFileOrNull(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function splitLines(raw: string): string[] {
  if (raw.length === 0) {
    return [];
  }

  return raw.replace(/\n$/u, "").split("\n");
}
