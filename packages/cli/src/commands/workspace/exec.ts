import { defineCommand } from "@lifecycle/cmd";
import { ensureBridge } from "@lifecycle/bridge";
import { z } from "zod";

import { failCommand, jsonFlag } from "../_shared";

function printOutput(
  text: string,
  write: (message: string) => void,
) {
  const lines = text.replace(/\n$/, "").split("\n");
  for (const line of lines) {
    if (line.length === 0) {
      write("");
      continue;
    }
    write(line);
  }
}

export default defineCommand({
  description: "Execute a command in a cloud workspace.",
  input: z.object({
    args: z.array(z.string()).describe("<workspace-id> -- <command...>"),
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const [workspaceId, ...command] = input.args;
      if (!workspaceId || command.length === 0) {
        context.stderr("Usage: lifecycle workspace exec <workspace-id> -- <command...>");
        return 1;
      }

      const { client } = await ensureBridge();
      const res = await client.workspaces[":id"].exec.$post({
        param: { id: workspaceId },
        json: { command },
      });
      const result = await res.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return result.exitCode ?? 0;
      }

      if (result.stdout) {
        printOutput(result.stdout, context.stdout);
      }
      if (result.stderr) {
        printOutput(result.stderr, context.stderr);
      }

      return result.exitCode ?? 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
