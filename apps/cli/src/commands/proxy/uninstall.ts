import { spawnSync } from "node:child_process";
import { defineCommand } from "@localhost-inc/cmd";
import { uninstallProxyCleanHttp } from "@/bridge";
import { z } from "zod";

import { failCommand, jsonFlag } from "../_shared";

function rerunWithSudo(): number {
  const argv = process.argv.slice(1);
  const result = spawnSync("sudo", ["env", "LIFECYCLE_INSTALL_AS_ROOT=1", process.execPath, ...argv], {
    stdio: "inherit",
  });
  return result.status ?? 1;
}

export default defineCommand({
  description: "Remove optional clean HTTP lifecycle.localhost routing from this machine.",
  input: z.object({
    dryRun: z.boolean().default(false).describe("Print the actions without changing the system."),
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      if (!input.dryRun && process.getuid?.() !== 0 && process.env.LIFECYCLE_INSTALL_AS_ROOT !== "1") {
        return rerunWithSudo();
      }

      const actions = await uninstallProxyCleanHttp({ dryRun: input.dryRun });
      if (input.json) {
        context.stdout(JSON.stringify({ actions, dryRun: input.dryRun }, null, 2));
        return 0;
      }

      context.stdout(
        input.dryRun
          ? "Dry run for preview proxy uninstall:"
          : "Removed clean HTTP lifecycle.localhost routing.",
      );
      for (const action of actions) {
        context.stdout(`- ${action}`);
      }
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
