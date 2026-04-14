import { defineCommand } from "@localhost-inc/cmd";
import { ensureBridge } from "@/bridge";
import { z } from "zod";

import { failCommand, jsonFlag, resolveWorkspaceId, stackServices, workspaceIdFlag } from "../_shared";

export default defineCommand({
  description: "Show environment service status for the current workspace.",
  input: z.object({
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const { client } = await ensureBridge();
      const response = await client.workspaces[":id"].stack.$get({
        param: { id: workspaceId },
      });
      const result = await response.json();
      const services = stackServices(result.stack);

      if (input.json) {
        context.stdout(JSON.stringify({ stack: result.stack }, null, 2));
        return 0;
      }

      if (result.stack.state === "missing") {
        context.stdout("No lifecycle.json found. Managed stack commands are unavailable.");
        return 0;
      }

      if (result.stack.state === "unconfigured") {
        context.stdout("No managed stack configured for this workspace.");
        return 0;
      }

      if (result.stack.state === "invalid") {
        for (const error of result.stack.errors) {
          context.stderr(error);
        }
        return 1;
      }

      if (services.length === 0) {
        context.stdout("No managed services configured for this workspace.");
        return 0;
      }

      for (const service of services) {
        const indicator =
          service.status === "ready"
            ? "●"
            : service.status === "starting"
              ? "◐"
              : service.status === "failed"
                ? "✗"
                : "○";

        const port = service.assigned_port ? `  :${service.assigned_port}` : "";
        context.stdout(`${indicator} ${service.name.padEnd(16)} ${service.status}${port}`);
      }

      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
