import {
  runClaudeWorker,
  type ClaudeWorkerInput,
  type ClaudeLoginMethod as ClaudeWorkerLoginMethod,
  type ClaudeWorkerPermissionMode,
} from "@lifecycle/agents/providers/claude/worker";
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

export default defineCommand({
  description: "Run a Claude-backed agent worker over stdin/stdout NDJSON.",
  input: z.object({
    dangerousSkipPermissions: z.boolean().default(false),
    effort: ClaudeEffortSchema.optional(),
    loginMethod: ClaudeLoginMethodSchema.default("claudeai"),
    model: z.string().default("default"),
    permissionMode: ClaudePermissionModeSchema.default("default"),
    providerSessionId: z.string().optional(),
    workspacePath: z.string().min(1),
  }),
  async run(input) {
    return runClaudeWorker(input as ClaudeWorkerInput & {
      loginMethod: ClaudeWorkerLoginMethod;
      permissionMode: ClaudeWorkerPermissionMode;
    });
  },
});
