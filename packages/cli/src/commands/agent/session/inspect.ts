import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import {
  createAgentSessionInspectRequest,
  requestBridge,
  resolveAgentSessionId,
} from "../../../bridge";
import { failCommand, jsonFlag } from "../../_shared";

export default defineCommand({
  description: "Inspect an agent session: metadata, messages, and parts.",
  input: z.object({
    json: jsonFlag,
    sessionId: z
      .string()
      .optional()
      .describe(
        "Agent session id. If omitted, reads LIFECYCLE_AGENT_SESSION_ID from the environment.",
      ),
  }),
  run: async (input, context) => {
    try {
      const sessionId = resolveAgentSessionId(input.sessionId);
      const response = await requestBridge(
        createAgentSessionInspectRequest({ sessionId }),
      );

      if (input.json) {
        context.stdout(JSON.stringify(response.result, null, 2));
        return 0;
      }

      const { session, messages } = response.result as {
        session: Record<string, unknown>;
        messages: Array<{
          id: string;
          role: string;
          text: string;
          turn_id: string | null;
          parts: Array<{
            part_type: string;
            text: string | null;
            data: string | null;
          }>;
          created_at: string;
        }>;
      };

      context.stdout(`Session: ${session.title || session.id}`);
      context.stdout(`provider: ${session.provider}`);
      context.stdout(`status: ${session.status}`);
      context.stdout(`id: ${session.id}`);
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
            message.text.length > 120
              ? `${message.text.slice(0, 120)}...`
              : message.text;
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
