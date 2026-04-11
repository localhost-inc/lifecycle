import { describe, expect, test } from "bun:test";
import { defineCommand } from "@localhost-inc/cmd";
import { z } from "zod";

import { runCli } from "./runner";
import type { CommandRegistry } from "./types";

function createIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    io: {
      stderr: (message: string) => stderr.push(message),
      stdout: (message: string) => stdout.push(message),
    },
    stderr,
    stdout,
  };
}

describe("runCli with a static registry", () => {
  test("renders namespace help without scanning the filesystem", async () => {
    const sink = createIo();
    const registry: CommandRegistry = {
      "workspace/create": async () =>
        defineCommand({
          description: "Create a workspace.",
          input: z.object({}),
          run: async () => 0,
        }) as any,
      "workspace/list": async () =>
        defineCommand({
          description: "List workspaces.",
          input: z.object({}),
          run: async () => 0,
        }) as any,
    };

    const code = await runCli({
      argv: ["workspace"],
      baseDir: "/tmp/unused",
      io: sink.io,
      name: "lifecycle",
      registry,
    });

    expect(code).toBe(0);
    expect(sink.stdout[0]).toContain("Usage: lifecycle workspace <command> [flags]");
    expect(sink.stdout[0]).toContain("create");
    expect(sink.stdout[0]).toContain("list");
    expect(sink.stderr).toEqual([]);
  });

  test("runs commands from the registry", async () => {
    const sink = createIo();
    const registry: CommandRegistry = {
      "workspace/status": async () =>
        defineCommand({
          input: z.object({
            format: z.string(),
          }),
          run: async (input, context) => {
            context.stdout(JSON.stringify(input));
            return 0;
          },
        }) as any,
    };

    const code = await runCli({
      argv: ["workspace", "status", "--format", "json"],
      baseDir: "/tmp/unused",
      io: sink.io,
      name: "lifecycle",
      registry,
    });

    expect(code).toBe(0);
    expect(sink.stdout).toEqual(['{"format":"json"}']);
    expect(sink.stderr).toEqual([]);
  });
});
