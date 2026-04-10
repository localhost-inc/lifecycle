import { defineCommand } from "@lifecycle/cmd";
import { cancel, intro, isCancel, log, multiselect, outro } from "@clack/prompts";
import { z } from "zod";

import { installMcpTarget, resolveMcpTargets, type McpScope } from "../../integrations/mcp";

export default defineCommand({
  description: "Install the Lifecycle MCP server into agent harness configs.",
  input: z.object({
    force: z
      .boolean()
      .default(false)
      .describe("Deprecated. Lifecycle install now merges only the managed MCP entry."),
    scope: z
      .enum(["user", "project", "local"])
      .default("project")
      .describe(
        "user (personal, all projects), project (team-shared, committed), or local (personal, this project, gitignored).",
      ),
  }),
  run: async (input) => {
    if (input.force) {
      log.info("`--force` is deprecated. Lifecycle now merges only the managed MCP entry.");
    }

    const targets = resolveMcpTargets(input.scope as McpScope);
    if (targets.length === 0) {
      log.error(`No harnesses support the "${input.scope}" scope.`);
      return 1;
    }

    intro("lifecycle mcp install");

    const selected = await multiselect({
      initialValues: targets.map((target) => target.harness_id),
      message: `Install into (${input.scope}):`,
      options: targets.map((target) => ({
        hint: target.path,
        label: target.label,
        value: target.harness_id,
      })),
    });

    if (isCancel(selected)) {
      cancel("Cancelled.");
      return 1;
    }

    for (const harnessId of selected) {
      const target = targets.find((candidate) => candidate.harness_id === harnessId);
      if (!target) {
        continue;
      }

      const result = installMcpTarget(target, { args: ["mcp"], command: "lifecycle" });
      if (result === "unchanged") {
        log.info(`${target.label} — already up to date`);
      } else {
        log.success(`${target.label} — ${result} ${target.path}`);
      }
    }

    outro("Done.");
    return 0;
  },
});
