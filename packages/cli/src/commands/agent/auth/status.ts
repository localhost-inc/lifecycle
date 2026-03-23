import { checkClaudeAuth } from "@lifecycle/agents/providers/claude/auth";
import { checkCodexAuth } from "@lifecycle/agents/providers/codex/auth";
import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

export default defineCommand({
  description: "Check authentication status for an agent provider.",
  input: z.object({
    provider: z.enum(["claude", "codex"]),
  }),
  async run(input) {
    switch (input.provider) {
      case "claude":
        await checkClaudeAuth();
        return 0;
      case "codex":
        await checkCodexAuth();
        return 0;
    }
  },
});
