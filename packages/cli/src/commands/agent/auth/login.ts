import { loginClaudeAuth } from "@lifecycle/agents/internal/providers/claude/auth";
import { loginCodexAuth } from "@lifecycle/agents/internal/providers/codex/auth";
import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

export default defineCommand({
  description: "Trigger sign-in for an agent provider.",
  input: z.object({
    provider: z.enum(["claude", "codex"]),
  }),
  async run(input) {
    switch (input.provider) {
      case "claude":
        await loginClaudeAuth();
        return 0;
      case "codex":
        await loginCodexAuth();
        return 0;
    }
  },
});
