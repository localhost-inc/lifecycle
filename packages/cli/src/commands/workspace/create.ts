import { resolve } from "node:path";
import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { ensureBridge } from "@lifecycle/bridge";
import { failCommand, jsonFlag } from "../_shared";

export default defineCommand({
  description: "Create a workspace for a project.",
  input: z.object({
    args: z.array(z.string()).optional().describe("[name]"),
    json: jsonFlag,
    repoPath: z.string().optional().describe("Local repo path. Defaults to current directory."),
    ref: z.string().optional().describe("Git ref or branch to base the workspace on."),
  }),
  run: async (input, context) => {
    try {
      const name = input.args?.[0];
      if (!name) {
        context.stderr(
          "Usage: lifecycle workspace create <name> --host local [--repo-path <path>] [--ref <branch>]",
        );
        return 1;
      }

      const repoPath = resolve(input.repoPath ?? process.cwd());
      const ref = input.ref ?? name;

      const { client } = await ensureBridge();
      const response = await client.workspaces.$post({
        json: { repoPath, name, sourceRef: ref },
      });
      const payload = await response.json();

      if (input.json) {
        context.stdout(JSON.stringify(payload, null, 2));
        return 0;
      }

      const workspaceRoot =
        typeof payload === "object" &&
        payload !== null &&
        "workspaceRoot" in payload &&
        typeof payload.workspaceRoot === "string"
          ? payload.workspaceRoot
          : null;

      if (workspaceRoot) {
        context.stdout(`Workspace "${name}" created at ${workspaceRoot}`);
      } else {
        context.stdout(`Workspace "${name}" created.`);
      }
      return 0;
    } catch (error) {
      return failCommand(error, {
        json: input.json,
        stderr: context.stderr,
      });
    }
  },
});
