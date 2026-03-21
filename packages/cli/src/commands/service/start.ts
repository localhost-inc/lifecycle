import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import {
  createServiceStartRequest,
  loadManifestForServiceStart,
  requestBridge,
  resolveWorkspaceId,
} from "../../bridge";
import { failCommand, jsonFlag, printServiceSummary, workspaceIdFlag } from "../_shared";

export default defineCommand({
  description: "Start services for the current workspace.",
  input: z.object({
    args: z
      .array(z.string())
      .describe("Optional service names to start. Omit to start the full workspace service chain."),
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const manifest = await loadManifestForServiceStart();
      const response = await requestBridge(
        createServiceStartRequest({
          manifestFingerprint: manifest.manifestFingerprint,
          manifestJson: manifest.manifestJson,
          serviceNames: input.args,
          workspaceId,
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify(response.result, null, 2));
        return 0;
      }

      if (response.result.startedServices.length > 0) {
        context.stdout(`Started services: ${response.result.startedServices.join(", ")}`);
      } else {
        context.stdout(`Started workspace services for ${response.result.workspaceId}.`);
      }

      for (const service of response.result.services) {
        printServiceSummary(service, context.stdout);
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
