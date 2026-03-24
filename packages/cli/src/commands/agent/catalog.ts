import { getClaudeModelCatalog } from "@lifecycle/agents/providers/claude/catalog";
import { getCodexModelCatalog } from "@lifecycle/agents/providers/codex/catalog";
import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";
import { failCommand } from "../_shared";

export default defineCommand({
  description: "Emit the live model and reasoning catalog for an agent provider.",
  input: z.object({
    loginMethod: z.enum(["claudeai", "console"]).optional(),
    provider: z.enum(["claude", "codex"]),
  }),
  async run(input, context) {
    try {
      const catalog =
        input.provider === "claude"
          ? await getClaudeModelCatalog({
              ...(input.loginMethod ? { loginMethod: input.loginMethod } : {}),
            })
          : await getCodexModelCatalog();

      context.stdout(JSON.stringify(catalog, null, 2));
      return 0;
    } catch (error) {
      return failCommand(error, {
        json: true,
        stderr: context.stderr,
      });
    }
  },
});
