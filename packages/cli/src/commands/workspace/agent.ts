import { spawn } from "node:child_process";
import { defineCommand } from "@lifecycle/cmd";
import { ensureBridge } from "@lifecycle/bridge";
import { buildCloudShellSshArgs } from "@lifecycle/workspace/internal/cloud";
import { z } from "zod";

import { gatherEnvironment } from "../../env-sync";
import { failCommand, jsonFlag } from "../_shared";

function buildProviderLaunchCommand(provider: "claude" | "codex"): string {
  if (provider === "claude") return "lifecycle_launch_claude";
  return "lifecycle_launch_codex";
}

function buildSessionName(provider: string): string {
  return `agent-${provider}`;
}

function normalizeInteractiveExitCode(code: number, startedAt: number): number {
  if (code === 255 && Date.now() - startedAt > 1000) return 0;
  return code;
}

/**
 * Phase 1: piped SSH — sync environment, start tmux session, write trigger file.
 */
function setupTmuxSession(sshArgs: string[], sessionName: string, launchFn: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ssh = spawn("ssh", sshArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let injected = false;

    const setupCmd = [
      ...gatherEnvironment(),
      `tmux new-session -d -s ${sessionName} "${launchFn}" 2>/dev/null`,
      `echo ${sessionName} > /tmp/.lifecycle-tmux-attach`,
      `exit`,
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
  description: "Launch an agent in a cloud workspace.",
  input: z.object({
    args: z.array(z.string()).describe("<workspace> <provider>"),
    json: jsonFlag,
  }),
  run: async (input, context) => {
    try {
      const workspace = input.args[0];
      const provider = input.args[1] as "claude" | "codex" | undefined;

      if (!workspace || !provider) {
        context.stderr("Usage: lifecycle workspace agent <workspace> <provider>");
        context.stderr("  provider: claude, codex");
        return 1;
      }

      if (provider !== "claude" && provider !== "codex") {
        context.stderr(`Unknown provider "${provider}". Use: claude, codex`);
        return 1;
      }

      const { client } = await ensureBridge();
      const res = await client.workspaces[":id"].shell.$get({
        param: { id: workspace },
      });
      const result = await res.json();

      if (input.json) {
        context.stdout(
          JSON.stringify(
            {
              workspace,
              provider,
              cwd: result.cwd,
              host: result.host,
              home: result.home,
            },
            null,
            2,
          ),
        );
        return 0;
      }

      const launchFn = buildProviderLaunchCommand(provider);
      const sessionName = buildSessionName(provider);
      const sshArgs = buildCloudShellSshArgs(result);

      context.stdout(`Launching ${provider} in ${workspace}...`);

      await setupTmuxSession(sshArgs, sessionName, launchFn);

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
