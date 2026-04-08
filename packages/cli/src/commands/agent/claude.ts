import {
  runClaudeProvider,
  type ClaudeProviderInput,
  type ClaudeLoginMethod,
  type ClaudeProviderPermissionMode,
} from "@lifecycle/agents/internal/providers/claude/provider";
import { LIFECYCLE_CLI_PATH_ENV } from "@lifecycle/contracts";
import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

const ClaudePermissionModeSchema = z.enum([
  "acceptEdits",
  "bypassPermissions",
  "default",
  "dontAsk",
  "plan",
]);

const ClaudeLoginMethodSchema = z.enum(["claudeai", "console"]);
const ClaudeEffortSchema = z.enum(["low", "medium", "high", "max"]);

function buildMcpServers(): ClaudeProviderInput["mcpServers"] {
  const cliPath = process.env[LIFECYCLE_CLI_PATH_ENV];
  if (!cliPath) return undefined;

  return {
    lifecycle: {
      type: "stdio",
      command: cliPath,
      args: ["mcp"],
    },
  };
}

export default defineCommand({
  description: "Run a Claude-backed agent provider over stdin/stdout NDJSON.",
  input: z.object({
    dangerousSkipPermissions: z.boolean().default(false),
    effort: ClaudeEffortSchema.optional(),
    loginMethod: ClaudeLoginMethodSchema.default("claudeai"),
    model: z.string().default("default"),
    permissionMode: ClaudePermissionModeSchema.default("default"),
    providerId: z.string().optional(),
    workspacePath: z.string().min(1),
  }),
  async run(input) {
    return runClaudeProvider({
      ...input,
      mcpServers: buildMcpServers(),
    } as ClaudeProviderInput & {
      loginMethod: ClaudeLoginMethod;
      permissionMode: ClaudeProviderPermissionMode;
    });
  },
});
