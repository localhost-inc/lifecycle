import {
  runClaudeProvider,
  type ClaudeLoginMethod,
  type ClaudeProviderInput,
  type ClaudeProviderPermissionMode,
} from "@lifecycle/agents/internal/providers/claude/provider";
import {
  runCodexProvider,
  type CodexApprovalPolicy,
  type CodexProviderInput,
  type CodexReasoningEffort,
  type CodexSandboxMode,
} from "@lifecycle/agents/internal/providers/codex/provider";
import { LIFECYCLE_CLI_PATH_ENV } from "@lifecycle/contracts";

type ParsedAgentWorkerInput =
  | { input: ClaudeProviderInput; provider: "claude" }
  | { input: CodexProviderInput; provider: "codex" };

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function buildClaudeMcpServers(
  environment: NodeJS.ProcessEnv,
): ClaudeProviderInput["mcpServers"] | undefined {
  const cliPath = environment[LIFECYCLE_CLI_PATH_ENV]?.trim();
  if (!cliPath) {
    return undefined;
  }

  return {
    lifecycle: {
      type: "stdio",
      command: cliPath,
      args: ["mcp"],
    },
  };
}

function parseAgentWorkerArgs(
  argv: string[],
  environment: NodeJS.ProcessEnv = process.env,
): ParsedAgentWorkerInput {
  if (argv[0] !== "agent") {
    throw new Error("Bridge agent worker expected an 'agent' command prefix.");
  }

  const provider = argv[1];
  if (provider !== "claude" && provider !== "codex") {
    throw new Error(`Unsupported bridge agent provider: ${provider ?? "<missing>"}.`);
  }

  const options = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument?.startsWith("--")) {
      throw new Error(`Unexpected bridge agent argument: ${argument ?? "<missing>"}.`);
    }

    if (argument === "--dangerous-bypass" || argument === "--dangerous-skip-permissions") {
      flags.add(argument);
      continue;
    }

    options.set(argument, requireValue(argv, index + 1, argument));
    index += 1;
  }

  const workspacePath = options.get("--workspace-path");
  if (!workspacePath) {
    throw new Error("Bridge agent worker requires --workspace-path.");
  }

  if (provider === "claude") {
    const effort = options.get("--effort") as ClaudeProviderInput["effort"] | undefined;
    const providerId = options.get("--provider-id");
    const mcpServers = buildClaudeMcpServers(environment);
    return {
      provider,
      input: {
        dangerousSkipPermissions: flags.has("--dangerous-skip-permissions"),
        loginMethod: (options.get("--login-method") as ClaudeLoginMethod | undefined) ?? "claudeai",
        model: options.get("--model") ?? "default",
        permissionMode:
          (options.get("--permission-mode") as ClaudeProviderPermissionMode | undefined) ??
          "default",
        workspacePath,
        ...(effort ? { effort } : {}),
        ...(mcpServers ? { mcpServers } : {}),
        ...(providerId ? { providerId } : {}),
      },
    };
  }

  const model = options.get("--model");
  const modelReasoningEffort = options.get("--model-reasoning-effort") as
    | CodexReasoningEffort
    | undefined;
  const providerId = options.get("--provider-id");
  return {
    provider,
    input: {
      approvalPolicy:
        (options.get("--approval-policy") as CodexApprovalPolicy | undefined) ?? "untrusted",
      dangerousBypass: flags.has("--dangerous-bypass"),
      sandboxMode:
        (options.get("--sandbox-mode") as CodexSandboxMode | undefined) ?? "workspace-write",
      workspacePath,
      ...(model ? { model } : {}),
      ...(modelReasoningEffort ? { modelReasoningEffort } : {}),
      ...(providerId ? { providerId } : {}),
    },
  };
}

export async function main(
  argv: string[] = process.argv.slice(2),
  environment: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const parsed = parseAgentWorkerArgs(argv, environment);
  if (parsed.provider === "claude") {
    return await runClaudeProvider(parsed.input);
  }
  return await runCodexProvider(parsed.input);
}

if (import.meta.main) {
  main().then(
    (code) => {
      process.exit(code);
    },
    (error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exit(1);
    },
  );
}

export { parseAgentWorkerArgs, buildClaudeMcpServers };
