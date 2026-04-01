import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { buildCloudShellSshArgs } from "../../cloud-shell";
import { createClient } from "../../rpc-client";
import { failCommand, jsonFlag } from "../_shared";

export function buildProviderLaunchCommand(provider: "claude" | "codex"): string {
  if (provider === "claude") {
    return "lifecycle_launch_claude";
  }

  return "lifecycle_launch_codex";
}

export function buildSessionName(provider: string): string {
  return `agent-${provider}`;
}

function normalizeInteractiveExitCode(code: number, startedAt: number): number {
  if (code === 255 && Date.now() - startedAt > 1000) {
    return 0;
  }

  return code;
}

/**
 * Phase 1: fully-piped SSH that waits for the shell to send output
 * (proving the connection is live), then injects commands to start
 * a background tmux session and write the trigger file.  Silent —
 * the user sees nothing.
 */
/**
 * Read local provider credentials and return shell commands to write
 * them to the workspace's persistent storage.
 */
function buildCredentialCommands(provider: string): string[] {
  const cmds: string[] = [];

  if (provider === "codex") {
    try {
      const authPath = join(homedir(), ".codex", "auth.json");
      const encoded = Buffer.from(readFileSync(authPath)).toString("base64");
      cmds.push(
        `mkdir -p /home/lifecycle/.codex`,
        `echo ${encoded} | base64 -d > /home/lifecycle/.codex/auth.json`,
      );
    } catch {
      // No local codex credentials — user will need to auth on the remote.
    }
  }

  return cmds;
}

function setupTmuxSession(
  sshArgs: string[],
  sessionName: string,
  launchFn: string,
  provider: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ssh = spawn("ssh", sshArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let injected = false;

    const setupCmd = [
      ...buildCredentialCommands(provider),
      `tmux new-session -d -s ${sessionName} "${launchFn}" 2>/dev/null`,
      `echo ${sessionName} > /tmp/.lifecycle-tmux-attach`,
      `exit`,
    ].join("; ");

    // Wait for any output from the shell — that proves SSH connected
    // and the shell is alive.  Then inject.
    ssh.stdout.on("data", () => {
      if (!injected) {
        injected = true;
        ssh.stdin.write(setupCmd + "\n");
      }
    });

    // Also listen on stderr in case the shell sends output there first.
    ssh.stderr.on("data", () => {
      if (!injected) {
        injected = true;
        ssh.stdin.write(setupCmd + "\n");
      }
    });

    const timeout = setTimeout(() => {
      ssh.kill();
      reject(new Error("Setup phase timed out."));
    }, 15_000);

    ssh.on("close", () => {
      clearTimeout(timeout);
      resolve();
    });

    ssh.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export default defineCommand({
  description: "Launch an agent provider in a cloud workspace shell.",
  input: z.object({
    workspaceId: z.string().describe("Workspace id."),
    provider: z.enum(["claude", "codex"]).describe("Agent provider to launch."),
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const client = createClient();

      const res = await client.workspaces[":workspaceId"].shell.$get({
        param: { workspaceId: input.workspaceId },
      });
      const result = await res.json();

      if (input.json) {
        context.stdout(JSON.stringify({
          workspaceId: input.workspaceId,
          provider: input.provider,
          cwd: result.cwd,
          host: result.host,
          home: result.home,
        }, null, 2));
        return 0;
      }

      const launchFn = buildProviderLaunchCommand(input.provider);
      const sessionName = buildSessionName(input.provider);
      const sshArgs = buildCloudShellSshArgs(result);

      context.stdout(`Launching ${input.provider} in workspace ${input.workspaceId}...`);

      // Phase 1: silent setup — start tmux session + write trigger file.
      await setupTmuxSession(sshArgs, sessionName, launchFn, input.provider);

      // Phase 2: full TTY attach — profile hook reads trigger and
      // attaches to the tmux session.  stdio: "inherit" gives zero
      // latency, proper resize, and clean terminal.
      const startedAt = Date.now();
      const ssh = spawn("ssh", sshArgs, { stdio: "inherit" });

      const exitCode = await new Promise<number>((resolve) => {
        ssh.on("close", (code) => {
          resolve(normalizeInteractiveExitCode(code ?? 0, startedAt));
        });
        ssh.on("error", (err) => {
          context.stderr(`SSH error: ${err.message}`);
          resolve(1);
        });
      });

      return exitCode;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
