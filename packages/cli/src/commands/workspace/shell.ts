import { spawn } from "node:child_process";
import { defineCommand, defineFlag } from "@lifecycle/cmd";
import { z } from "zod";

import { buildCloudShellSshArgs } from "../../cloud-shell";
import { gatherEnvironment } from "../../env-sync";
import { createClient } from "../../rpc-client";
import { failCommand, jsonFlag } from "../_shared";

/**
 * Phase 1: piped SSH that syncs the local environment to the workspace.
 * Waits for shell output, injects sync commands, then exits.
 */
function syncEnvironment(sshArgs: string[]): Promise<void> {
  const envCmds = gatherEnvironment();
  if (envCmds.length === 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const ssh = spawn("ssh", sshArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let injected = false;

    const syncCmd = [...envCmds, "exit"].join("; ");

    ssh.stdout.on("data", () => {
      if (!injected) {
        injected = true;
        ssh.stdin.write(syncCmd + "\n");
      }
    });

    ssh.stderr.on("data", () => {
      if (!injected) {
        injected = true;
        ssh.stdin.write(syncCmd + "\n");
      }
    });

    const timeout = setTimeout(() => {
      ssh.kill();
      reject(new Error("Environment sync timed out."));
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

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function setupTmuxSession(sshArgs: string[], sessionName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ssh = spawn("ssh", sshArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let injected = false;
    const quotedSession = shellEscape(sessionName);
    const setupCmd = [
      ...gatherEnvironment(),
      `tmux has-session -t ${quotedSession} 2>/dev/null || tmux new-session -d -s ${quotedSession}`,
      `printf %s ${quotedSession} > /tmp/.lifecycle-tmux-attach`,
      "exit",
    ].join("; ");

    ssh.stdout.on("data", () => {
      if (!injected) {
        injected = true;
        ssh.stdin.write(setupCmd + "\n");
      }
    });

    ssh.stderr.on("data", () => {
      if (!injected) {
        injected = true;
        ssh.stdin.write(setupCmd + "\n");
      }
    });

    const timeout = setTimeout(() => {
      ssh.kill();
      reject(new Error("tmux setup timed out."));
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
  description: "Open a shell in a cloud workspace.",
  input: z.object({
    args: z.array(z.string()).describe("<workspace>"),
    json: jsonFlag,
    tmuxSession: defineFlag(
      z.string().optional().describe("Persistent tmux session name to create or attach before the shell opens."),
      { aliases: "t" },
    ),
  }),
  run: async (input, context) => {
    try {
      const workspaceId = input.args[0];
      if (!workspaceId) {
        context.stderr("Usage: lifecycle workspace shell <workspace>");
        return 1;
      }

      const client = createClient();
      const res = await client.workspaces[":workspaceId"].shell.$get({
        param: { workspaceId },
      });
      const result = await res.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      const sshArgs = buildCloudShellSshArgs(result);

      context.stdout(`Connecting to workspace ${workspaceId}...`);

      if (input.tmuxSession) {
        await setupTmuxSession(sshArgs, input.tmuxSession);
      } else {
        await syncEnvironment(sshArgs);
      }

      // Phase 2: interactive shell.
      const ssh = spawn("ssh", sshArgs, {
        stdio: "inherit",
      });

      const exitCode = await new Promise<number>((resolve) => {
        ssh.on("close", (code) => resolve(code ?? 0));
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
