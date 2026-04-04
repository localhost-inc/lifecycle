import { defineCommand } from "@lifecycle/cmd";
import { spawnSync, execSync } from "node:child_process";
import { z } from "zod";

export default defineCommand({
  description: "Kill stale TUI tmux sessions.",
  input: z.object({
    all: z
      .boolean()
      .optional()
      .describe("Kill all lifecycle tmux sessions, not just detached ones."),
  }),
  run: async (input, context) => {
    const sessions = listLifecycleSessions();

    if (sessions.length === 0) {
      context.stdout("No lifecycle tmux sessions found.");
      return 0;
    }

    const targets = input.all
      ? sessions
      : sessions.filter((s) => !s.attached);

    if (targets.length === 0) {
      context.stdout(
        `${sessions.length} lifecycle session(s) found, all attached. Use --all to force-kill.`,
      );
      return 0;
    }

    for (const session of targets) {
      spawnSync("tmux", ["kill-session", "-t", session.name], {
        stdio: "ignore",
      });
      context.stdout(`killed ${session.name}`);
    }

    const skipped = sessions.length - targets.length;
    if (skipped > 0) {
      context.stdout(`(${skipped} attached session(s) kept)`);
    }

    return 0;
  },
});

type TmuxSession = {
  name: string;
  attached: boolean;
};

function listLifecycleSessions(): TmuxSession[] {
  try {
    const output = execSync(
      "tmux list-sessions -F '#{session_name}\t#{session_attached}' 2>/dev/null",
      { encoding: "utf-8" },
    );

    return output
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const [name = "", attachedStr = "0"] = line.split("\t");
        return { name, attached: attachedStr !== "0" };
      })
      .filter(
        (s) => s.name.startsWith("lifecycle-") || s.name.startsWith("lc-"),
      );
  } catch {
    return [];
  }
}
