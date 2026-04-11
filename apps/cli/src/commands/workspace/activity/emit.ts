import { defineCommand } from "@localhost-inc/cmd";
import { ensureBridge } from "@/bridge";
import { z } from "zod";

import {
  failCommand,
  jsonFlag,
  resolveTerminalId,
  resolveWorkspaceId,
  terminalIdFlag,
  workspaceIdFlag,
} from "../../_shared";
import { LifecycleCliError } from "../../../errors";

function parseMetadata(raw?: string): Record<string, unknown> | undefined {
  if (!raw) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new LifecycleCliError({
      code: "metadata_invalid",
      message: `Could not parse --metadata as JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
      suggestedAction: 'Pass a JSON object, for example --metadata \'{"source":"hook"}\'.',
    });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new LifecycleCliError({
      code: "metadata_invalid",
      message: "Lifecycle activity metadata must be a JSON object.",
      suggestedAction: 'Pass a JSON object, for example --metadata \'{"source":"hook"}\'.',
    });
  }

  return parsed as Record<string, unknown>;
}

export default defineCommand({
  description: "Emit an explicit activity event for the current Lifecycle-managed terminal.",
  input: z.object({
    args: z.array(z.string()).describe("<event>"),
    json: jsonFlag,
    kind: z.string().trim().min(1).optional(),
    metadata: z.string().optional().describe("Optional JSON object to attach as event metadata."),
    name: z.string().trim().min(1).optional(),
    provider: z.string().trim().min(1).optional(),
    terminalId: terminalIdFlag,
    turnId: z.string().trim().min(1).optional(),
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const [event] = input.args;
      if (!event || input.args.length !== 1) {
        context.stderr("Usage: lifecycle workspace activity emit <event>");
        return 1;
      }

      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const terminalId = resolveTerminalId(input.terminalId);
      const metadata = parseMetadata(input.metadata);
      const { client } = await ensureBridge();
      const response = await client.workspaces[":id"].activity.$post({
        param: { id: workspaceId },
        json: {
          event: event as
            | "turn.started"
            | "turn.completed"
            | "tool.started"
            | "tool.completed"
            | "waiting.started"
            | "waiting.completed",
          ...(input.kind ? { kind: input.kind } : {}),
          ...(metadata ? { metadata } : {}),
          ...(input.name ? { name: input.name } : {}),
          ...(input.provider ? { provider: input.provider } : {}),
          terminalId,
          ...(input.turnId ? { turnId: input.turnId } : {}),
        },
      });
      const result = await response.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
      }

      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
