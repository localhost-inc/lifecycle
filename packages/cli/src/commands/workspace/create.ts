import { defineCommand, defineFlag } from "@lifecycle/cmd";
import { z } from "zod";

import { createClient } from "../../rpc-client";
import { createWorkspaceCreateRequest, requestBridge } from "../../bridge";
import { failCommand, jsonFlag, printWorkspaceSummary, projectIdFlag } from "../_shared";

export default defineCommand({
  description: "Create a workspace for a project.",
  input: z.object({
    args: z.array(z.string()).optional().describe("[name]"),
    json: jsonFlag,
    host: z
      .enum(["local", "cloud"])
      .default("local")
      .describe("Workspace host. Use 'cloud' for a cloud workspace."),
    local: defineFlag(z.boolean().default(true).describe("Create a local workspace."), {
      aliases: "l",
    }),
    projectId: projectIdFlag,
    repoId: z.string().optional().describe("Repository id for cloud workspaces."),
    ref: z.string().optional().describe("Git ref or branch to base the workspace on."),
  }),
  run: async (input, context) => {
    try {
      // Cloud workspace path
      if (input.host === "cloud") {
        if (!input.repoId) {
          context.stderr("--repo-id is required for cloud workspaces.");
          return 1;
        }

        const name = input.args?.[0] ?? `workspace-${Date.now()}`;

        context.stdout(`Creating cloud workspace "${name}"...`);

        const client = createClient();
        const res = await client.workspaces.$post({
          json: {
            repositoryId: input.repoId,
            name,
            ...(input.ref ? { sourceRef: input.ref } : {}),
          },
        });
        const result = await res.json();
        const workspaceId = result.id;

        if (input.json) {
          context.stdout(JSON.stringify(result, null, 2));
          return 0;
        }

        // Poll until active or failed.
        const start = Date.now();
        const deadline = start + 300_000; // 5 min
        let status = result.status;
        let failureReason: string | undefined;

        while (status === "provisioning" && Date.now() < deadline) {
          const elapsed = Math.round((Date.now() - start) / 1000);
          process.stdout.write(`\rProvisioning workspace... ${elapsed}s`);

          await new Promise((r) => setTimeout(r, 5000));

          const pollRes = await client.workspaces[":workspaceId"].$get({
            param: { workspaceId },
          });
          const ws = await pollRes.json();
          status = ws.status;
          if ("failureReason" in ws && ws.failureReason) {
            failureReason = ws.failureReason as string;
          }
        }

        // Clear the progress line.
        process.stdout.write("\r" + " ".repeat(60) + "\r");

        if (status === "failed") {
          context.stderr(`Provisioning failed: ${failureReason ?? "unknown error"}`);
          return 1;
        }

        if (status === "provisioning") {
          const elapsed = Math.round((Date.now() - start) / 1000);
          context.stdout(`Still provisioning after ${elapsed}s. The container may still be starting.`);
          context.stdout(`Check status: lifecycle workspace get ${workspaceId}`);
          context.stdout(`Attach when ready: lifecycle workspace shell ${workspaceId}`);
          return 0;
        }

        context.stdout(`Workspace ready. id: ${workspaceId}`);
        context.stdout("");
        context.stdout(`Next: lifecycle workspace shell ${workspaceId}`);
        return 0;
      }

      // Local workspace path (existing behavior)
      const response = await requestBridge(
        createWorkspaceCreateRequest({
          local: input.local,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.ref ? { ref: input.ref } : {}),
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify(response.result, null, 2));
        return 0;
      }

      context.stdout("Workspace created.");
      context.stdout("");
      printWorkspaceSummary(response.result.workspace, context.stdout);

      return 0;
    } catch (error) {
      return failCommand(error, {
        json: input.json,
        stderr: context.stderr,
      });
    }
  },
});
