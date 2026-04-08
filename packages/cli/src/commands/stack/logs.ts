import { defineCommand, defineFlag } from "@lifecycle/cmd";
import { z } from "zod";
import { readBridgeLogs, streamBridgeLogs } from "../logs/bridge";
import { failCommand, jsonFlag, printLogLine, workspaceIdFlag } from "../_shared";

export default defineCommand({
  description: "Tail logs for services in the current workspace.",
  input: z.object({
    args: z.array(z.string()).describe("Optional service name to filter logs."),
    follow: defineFlag(z.boolean().default(false).describe("Follow log output."), {
      aliases: "f",
    }),
    grep: z.string().optional().describe("Filter log lines by a pattern."),
    json: jsonFlag,
    tail: defineFlag(
      z.coerce.number().int().positive().optional().describe("Tail the last N lines."),
      { aliases: "t" },
    ),
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      if (input.follow) {
        const ac = new AbortController();
        const onSignal = () => ac.abort();
        process.once("SIGINT", onSignal);
        process.once("SIGTERM", onSignal);

        try {
          await streamBridgeLogs(
            {
              ...(input.grep ? { grep: input.grep } : {}),
              json: input.json,
              ...(input.args.length > 0 ? { serviceNames: input.args } : {}),
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

      const snapshots =
        input.args.length > 0
          ? await Promise.all(
              input.args.map(async (service) =>
                await readBridgeLogs({
                  service,
                  ...(input.tail ? { tail: input.tail } : {}),
                  ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
                }),
              ),
            )
          : [
              await readBridgeLogs({
                ...(input.tail ? { tail: input.tail } : {}),
                ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
              }),
            ];
      const grepPattern = input.grep ? new RegExp(input.grep) : null;
      const matchesGrep = (text: string): boolean => (grepPattern ? grepPattern.test(text) : true);
      const allLines = snapshots.flatMap((snapshot) =>
        snapshot.lines.filter((line) => matchesGrep(line.text)),
      );

      if (input.json) {
        context.stdout(JSON.stringify(allLines, null, 2));
        return 0;
      }

      for (const line of allLines) {
        printLogLine(line, context.stdout);
      }

      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
