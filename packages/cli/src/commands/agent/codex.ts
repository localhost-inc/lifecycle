import {
  runCodexProvider,
  type CodexProviderInput,
} from "@lifecycle/agents/internal/providers/codex/provider";
import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

const CodexSandboxModeSchema = z.enum(["read-only", "workspace-write", "danger-full-access"]);
const CodexApprovalPolicySchema = z.enum(["untrusted", "on-request", "on-failure", "never"]);
const CodexModelReasoningEffortSchema = z.enum([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

export default defineCommand({
  description: "Run a Codex-backed agent provider over stdin/stdout NDJSON.",
  input: z.object({
    approvalPolicy: CodexApprovalPolicySchema.default("untrusted"),
    dangerousBypass: z.boolean().default(false),
    model: z.string().optional(),
    modelReasoningEffort: CodexModelReasoningEffortSchema.optional(),
    providerId: z.string().optional(),
    sandboxMode: CodexSandboxModeSchema.default("workspace-write"),
    workspacePath: z.string().min(1),
  }),
  async run(input) {
    return runCodexProvider(input as CodexProviderInput);
  },
});
