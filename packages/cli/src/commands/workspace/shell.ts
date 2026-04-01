import { spawn } from "node:child_process";
import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { buildCloudShellSshArgs } from "../../cloud-shell";
import { createClient } from "../../rpc-client";
import { failCommand, jsonFlag } from "../_shared";

export default defineCommand({
  description: "Open a shell in a cloud workspace.",
  input: z.object({
    args: z.array(z.string()).describe("<workspace-id>"),
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = input.args[0];
      if (!workspaceId) {
        context.stderr("Usage: lifecycle workspace shell <workspace-id>");
        return 1;
      }

      const client = createClient();
      const res = await client.workspaces[":workspaceId"].shell.$get({
        param: { workspaceId },
      });
      const result = await res.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      context.stdout(`Connecting to workspace ${workspaceId}...`);

      const ssh = spawn("ssh", buildCloudShellSshArgs(result), {
        stdio: "inherit",
      });

      const exitCode = await new Promise<number>((resolve) => {
        ssh.on("close", (code) => resolve(code ?? 0));
        ssh.on("error", (err) => {
          context.stderr(`SSH error: ${err.message}`);
          resolve(1);
        });
      });

      return exitCode;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
