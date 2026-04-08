import { defineCommand, defineFlag } from "@lifecycle/cmd";
import { z } from "zod";

import { readBridgeLogs, streamBridgeLogs } from "../logs/bridge";
import { failCommand, failValidation, jsonFlag, printLogLine, workspaceIdFlag } from "../_shared";

function validateServiceLogsInput(input: { args: string[] }): string | null {
  if (input.args.length !== 1) {
    return "lifecycle service logs requires exactly one <service> argument.";
  }

  return null;
}

export default defineCommand({
  description: "Tail logs for a service in the current workspace.",
  input: z.object({
    args: z.array(z.string()).describe("Service name to inspect."),
    follow: defineFlag(z.boolean().default(false).describe("Follow log output."), {
      aliases: "f",
    }),
    grep: z.string().optional().describe("Filter log lines by a pattern."),
    json: jsonFlag,
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
    const validationError = validateServiceLogsInput(input);
    if (validationError) {
      return failValidation(validationError, { json: input.json, stderr: context.stderr });
    }

    try {
      const service = input.args[0]!;

      if (input.follow) {
        const ac = new AbortController();

        const onSignal = () => {
          ac.abort();
        };
        process.once("SIGINT", onSignal);
        process.once("SIGTERM", onSignal);

        try {
          await streamBridgeLogs(
            {
              ...(input.grep ? { grep: input.grep } : {}),
              json: input.json,
              serviceNames: [service],
              ...(input.tail ? { tail: input.tail } : {}),
              ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
            },
            {
              onLine: (line) => {
                if (input.json) {
                  context.stdout(JSON.stringify(line));
                } else {
                  printLogLine(line, context.stdout);
                }
              },
              onSleep: async (ms) => await new Promise((resolve) => setTimeout(resolve, ms)),
            },
            ac.signal,
          );
        } finally {
          process.removeListener("SIGINT", onSignal);
          process.removeListener("SIGTERM", onSignal);
        }

        return 0;
      }

      const response = await readBridgeLogs({
        service,
        ...(input.tail ? { tail: input.tail } : {}),
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      });
      const grepPattern = input.grep ? new RegExp(input.grep) : null;
      const lines = response.lines.filter((line) =>
        grepPattern ? grepPattern.test(line.text) : true,
      );

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
