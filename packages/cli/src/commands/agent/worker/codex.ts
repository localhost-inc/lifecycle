import { runCodexWorker, type CodexWorkerInput } from "@lifecycle/agents/providers/codex/worker";
import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

const CodexSandboxModeSchema = z.enum(["read-only", "workspace-write", "danger-full-access"]);
const CodexApprovalPolicySchema = z.enum(["untrusted", "on-request", "on-failure", "never"]);
const CodexModelReasoningEffortSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]);

export default defineCommand({
  description: "Run a Codex-backed agent worker over stdin/stdout NDJSON.",
  input: z.object({
    approvalPolicy: CodexApprovalPolicySchema.default("untrusted"),
    dangerousBypass: z.boolean().default(false),
    model: z.string().optional(),
    modelReasoningEffort: CodexModelReasoningEffortSchema.optional(),
    providerSessionId: z.string().optional(),
    sandboxMode: CodexSandboxModeSchema.default("workspace-write"),
    workspacePath: z.string().min(1),
  }),
  async run(input) {
    return runCodexWorker(input as CodexWorkerInput);
  },
});
