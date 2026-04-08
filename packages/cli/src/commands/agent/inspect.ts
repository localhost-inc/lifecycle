import { defineCommand } from "@lifecycle/cmd";
import { ensureBridge } from "@lifecycle/bridge";
import type { AgentMessageWithParts, AgentRecord } from "@lifecycle/contracts";
import { z } from "zod";

import { resolveAgentId } from "../../desktop/rpc";
import { failCommand, jsonFlag } from "../_shared";

export default defineCommand({
  description: "Inspect an agent: metadata, messages, and parts.",
  input: z.object({
    json: jsonFlag,
    agentId: z
      .string()
      .optional()
      .describe("Agent id. If omitted, reads LIFECYCLE_AGENT_ID from the environment."),
  }),
  run: async (input, context) => {
    try {
      const agentId = resolveAgentId(input.agentId);
      const { client } = await ensureBridge();
      const response = await client.agents[":agentId"].$get({
        param: { agentId },
      });
      const result = await response.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      const { agent, messages } = result as {
        agent: AgentRecord;
        messages: AgentMessageWithParts[];
      };

      context.stdout(`Agent: ${agent.title || agent.id}`);
      context.stdout(`provider: ${agent.provider}`);
      context.stdout(`status: ${agent.status}`);
      context.stdout(`id: ${agent.id}`);
      context.stdout("");
      context.stdout(`Messages: ${messages.length}`);

      for (const message of messages) {
        context.stdout("");
        const turnLabel = message.turn_id ? ` [turn ${message.turn_id.slice(0, 8)}]` : "";
        context.stdout(`  ${message.role}${turnLabel}  ${message.created_at}`);

        for (const part of message.parts) {
          const preview = part.text
            ? part.text.length > 120
              ? `${part.text.slice(0, 120)}...`
              : part.text
            : part.data
              ? `(${part.data.length} bytes data)`
              : "";
          context.stdout(`    [${part.part_type}] ${preview}`);
        }

        if (message.parts.length === 0 && message.text) {
          const preview =
            message.text.length > 120 ? `${message.text.slice(0, 120)}...` : message.text;
          context.stdout(`    ${preview}`);
        }
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
