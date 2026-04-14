import { defineCommand } from "@localhost-inc/cmd";
import { proxyInstallStatus } from "@/bridge";
import { resolveBridgePort } from "@/bridge/stack";
import { z } from "zod";

import { failCommand, jsonFlag } from "../_shared";

export default defineCommand({
  description: "Show local preview proxy install status.",
  input: z.object({
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const status = await proxyInstallStatus();
      if (input.json) {
        context.stdout(JSON.stringify(status, null, 2));
        return status.installed ? 0 : 1;
      }

      context.stdout(`Platform: ${status.platform}`);
      context.stdout(`Supported: ${status.currentPlatformSupported ? "yes" : "no"}`);
      context.stdout(`Installed: ${status.installed ? "yes" : "no"}`);
      if (status.installed && status.state) {
        context.stdout(`Mode: clean HTTP on port 80 -> ${status.state.proxyPort}`);
        context.stdout(`Installed at: ${status.state.installedAt}`);
      } else {
        context.stdout(`Mode: fallback HTTP with explicit :${resolveBridgePort()} bridge port`);
      }
      return status.installed ? 0 : 1;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
