import { spawn } from "node:child_process";
import { defineCommand, defineFlag } from "@lifecycle/cmd";
import { ensureBridge } from "@lifecycle/bridge";
import { z } from "zod";

import { failCommand, jsonFlag } from "../_shared";

function runLaunchSpec(
  spec: {
    program: string;
    args: string[];
    cwd: string | null;
    env: Array<[string, string]>;
  },
  stdio: "ignore" | "inherit",
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(spec.program, spec.args, {
      stdio,
      cwd: spec.cwd ?? undefined,
      env: {
        ...process.env,
        ...Object.fromEntries(spec.env),
      },
    });

    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(1));
  });
}

export default defineCommand({
  description: "Open a shell in a workspace.",
  input: z.object({
    args: z.array(z.string()).describe("<workspace>"),
    json: jsonFlag,
    tmuxSession: defineFlag(
      z.string().optional().describe("Persistent tmux session name to create or attach before the shell opens."),
      { aliases: "t" },
    ),
  }),
  run: async (input, context) => {
    try {
      const workspaceId = input.args[0];
      if (!workspaceId) {
        context.stderr("Usage: lifecycle workspace shell <workspace>");
        return 1;
      }

      const { client } = await ensureBridge();
      const res = await client.workspaces[":id"].shell.$post({
        param: { id: workspaceId },
      });
      const { workspace, shell: runtime } = await res.json();

      if (input.json) {
        context.stdout(JSON.stringify({ workspace, shell: runtime }, null, 2));
        return runtime.launch_error || !runtime.spec ? 1 : 0;
      }

      if (runtime.launch_error || !runtime.spec) {
        context.stderr(runtime.launch_error ?? "Lifecycle could not resolve a shell runtime.");
        return 1;
      }

      if (runtime.prepare) {
        const prepareExitCode = await runLaunchSpec(runtime.prepare, "ignore");
        if (prepareExitCode !== 0) {
          context.stderr(`Shell prepare step failed with exit code ${prepareExitCode}.`);
          return prepareExitCode;
        }
      }

      return await runLaunchSpec(runtime.spec, "inherit");
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
