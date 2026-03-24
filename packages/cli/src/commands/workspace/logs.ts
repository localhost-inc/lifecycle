import { defineCommand, defineFlag } from "@lifecycle/cmd";
import { z } from "zod";

import {
  createWorkspaceLogsRequest,
  requestBridge,
  resolveWorkspaceId,
  streamBridge,
} from "../../bridge";
import { failCommand, jsonFlag, printLogLine, workspaceIdFlag } from "../_shared";

export default defineCommand({
  description: "Tail workspace service logs.",
  input: z.object({
    follow: defineFlag(z.boolean().default(false).describe("Follow log output."), {
      aliases: "f",
    }),
    grep: z.string().optional().describe("Filter log lines by a pattern."),
    json: jsonFlag,
    service: z.string().describe("Service name to inspect."),
    since: z.string().optional().describe("Only include logs newer than this duration."),
    tail: defineFlag(
      z.coerce.number().int().positive().optional().describe("Tail the last N lines."),
      {
        aliases: "t",
      },
    ),
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const grepPattern = input.grep ? new RegExp(input.grep) : null;

      const matchesGrep = (text: string): boolean => {
        if (!grepPattern) {
          return true;
        }
        return grepPattern.test(text);
      };

      if (input.follow) {
        const ac = new AbortController();

        const onSignal = () => {
          ac.abort();
        };
        process.once("SIGINT", onSignal);
        process.once("SIGTERM", onSignal);

        try {
          await streamBridge(
            createWorkspaceLogsRequest({
              follow: true,
              ...(input.grep ? { grep: input.grep } : {}),
              service: input.service,
              ...(input.since ? { since: input.since } : {}),
              ...(input.tail ? { tail: input.tail } : {}),
              workspaceId,
            }),
            (line) => {
              const logLine = line as {
                service: string;
                stream: string;
                text: string;
                timestamp: string;
              };
              if (!matchesGrep(logLine.text)) {
                return;
              }
              if (input.json) {
                context.stdout(JSON.stringify(logLine));
              } else {
                printLogLine(logLine, context.stdout);
              }
            },
            ac.signal,
          );
        } finally {
          process.removeListener("SIGINT", onSignal);
          process.removeListener("SIGTERM", onSignal);
        }

        return 0;
      }

      const response = await requestBridge(
        createWorkspaceLogsRequest({
          follow: false,
          ...(input.grep ? { grep: input.grep } : {}),
          service: input.service,
          ...(input.since ? { since: input.since } : {}),
          ...(input.tail ? { tail: input.tail } : {}),
          workspaceId,
        }),
      );

      const lines = response.result.lines.filter((line) => matchesGrep(line.text));

      if (input.json) {
        context.stdout(JSON.stringify(lines, null, 2));
        return 0;
      }

      for (const line of lines) {
        printLogLine(line, context.stdout);
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
