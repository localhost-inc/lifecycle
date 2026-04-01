import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LifecycleConfig } from "@lifecycle/contracts";
import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import { BridgeClientError } from "../errors";
import { loadManifest } from "../manifest";
import { failCommand, jsonFlag } from "./_shared";

type PrepareStep = LifecycleConfig["workspace"]["prepare"][number];

interface PrepareStepResult {
  command?: string | undefined;
  cwd?: string | undefined;
  durationMs: number;
  kind: "command" | "write_files";
  name: string;
  writtenFiles?: string[] | undefined;
}

function resolveStepCwd(workspacePath: string, cwd?: string): string {
  return path.resolve(workspacePath, cwd ?? ".");
}

function flushChunkLines(
  chunk: string,
  state: { remainder: string },
  onLine: (line: string) => void,
): void {
  const text = `${state.remainder}${chunk}`;
  const segments = text.split(/\r?\n/g);
  state.remainder = segments.pop() ?? "";
  for (const segment of segments) {
    onLine(segment);
  }
}

function flushRemainder(state: { remainder: string }, onLine: (line: string) => void): void {
  if (!state.remainder) {
    return;
  }

  onLine(state.remainder);
  state.remainder = "";
}

function createPrepareFailure(input: {
  command?: string | undefined;
  cwd?: string | undefined;
  details?: Record<string, unknown> | undefined;
  message: string;
  stepName: string;
  suggestedAction?: string | undefined;
  code?: string | undefined;
}): BridgeClientError {
  return new BridgeClientError({
    code: input.code ?? "prepare_step_failed",
    details: {
      ...(input.command ? { command: input.command } : {}),
      ...(input.cwd ? { cwd: input.cwd } : {}),
      ...input.details,
      stepName: input.stepName,
    },
    message: input.message,
    suggestedAction:
      input.suggestedAction ?? "Fix the failing prepare step or edit lifecycle.json, then retry.",
  });
}

async function runCommandStep(options: {
  emitHumanOutput: boolean;
  onStderr: (message: string) => void;
  onStdout: (message: string) => void;
  step: PrepareStep;
  workspacePath: string;
}): Promise<PrepareStepResult> {
  const startedAt = Date.now();
  const cwd = resolveStepCwd(options.workspacePath, options.step.cwd);

  return new Promise<PrepareStepResult>((resolve, reject) => {
    const child = spawn(options.step.command ?? "", {
      cwd,
      env: {
        ...process.env,
        ...options.step.env,
      },
      shell: true,
    });

    const stdoutState = { remainder: "" };
    const stderrState = { remainder: "" };
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      }, 1_000);
    }, options.step.timeout_seconds * 1_000);

    child.stdout?.on("data", (chunk) => {
      if (!options.emitHumanOutput) {
        return;
      }

      flushChunkLines(chunk.toString("utf8"), stdoutState, options.onStdout);
    });

    child.stderr?.on("data", (chunk) => {
      if (!options.emitHumanOutput) {
        return;
      }

      flushChunkLines(chunk.toString("utf8"), stderrState, options.onStderr);
    });

    child.once("error", (error) => {
      clearTimeout(timeoutHandle);
      reject(
        createPrepareFailure({
          command: options.step.command,
          cwd,
          message: `Prepare step "${options.step.name}" failed to start: ${error.message}`,
          stepName: options.step.name,
        }),
      );
    });

    child.once("close", (code, signal) => {
      clearTimeout(timeoutHandle);
      if (options.emitHumanOutput) {
        flushRemainder(stdoutState, options.onStdout);
        flushRemainder(stderrState, options.onStderr);
      }

      if (timedOut) {
        reject(
          createPrepareFailure({
            code: "operation_timeout",
            command: options.step.command,
            cwd,
            details: {
              timeoutSeconds: options.step.timeout_seconds,
            },
            message: `Prepare step "${options.step.name}" timed out after ${options.step.timeout_seconds} seconds.`,
            stepName: options.step.name,
            suggestedAction:
              "Increase timeout_seconds or fix the step so it completes within the configured timeout.",
          }),
        );
        return;
      }

      if (code !== 0) {
        reject(
          createPrepareFailure({
            command: options.step.command,
            cwd,
            details: {
              exitCode: code,
              signal,
            },
            message: `Prepare step "${options.step.name}" exited with code ${code ?? "unknown"}.`,
            stepName: options.step.name,
          }),
        );
        return;
      }

      resolve({
        command: options.step.command,
        cwd,
        durationMs: Date.now() - startedAt,
        kind: "command",
        name: options.step.name,
      });
    });
  });
}

async function runWriteFilesStep(options: {
  step: PrepareStep;
  workspacePath: string;
}): Promise<PrepareStepResult> {
  const startedAt = Date.now();
  const baseDirectory = resolveStepCwd(options.workspacePath, options.step.cwd);
  const writtenFiles: string[] = [];

  try {
    for (const file of options.step.write_files ?? []) {
      const absolutePath = path.isAbsolute(file.path)
        ? file.path
        : path.resolve(baseDirectory, file.path);

      await mkdir(path.dirname(absolutePath), { recursive: true });
      const content =
        typeof file.content === "string" ? file.content : `${(file.lines ?? []).join("\n")}\n`;
      await writeFile(absolutePath, content, "utf8");
      writtenFiles.push(absolutePath);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createPrepareFailure({
      cwd: baseDirectory,
      details: {
        writtenFiles,
      },
      message: `Prepare step "${options.step.name}" failed while writing files: ${message}`,
      stepName: options.step.name,
    });
  }

  return {
    cwd: baseDirectory,
    durationMs: Date.now() - startedAt,
    kind: "write_files",
    name: options.step.name,
    writtenFiles,
  };
}

async function executePrepare(options: {
  emitHumanOutput: boolean;
  onStderr: (message: string) => void;
  onStdout: (message: string) => void;
  workspacePath: string;
  steps: PrepareStep[];
}): Promise<PrepareStepResult[]> {
  const results: PrepareStepResult[] = [];

  for (const [index, step] of options.steps.entries()) {
    if (options.emitHumanOutput) {
      options.onStdout(
        `prepare ${index + 1}/${options.steps.length}: ${step.name}${
          step.command ? ` (${step.command})` : ""
        }`,
      );
    }

    const result = step.command
      ? await runCommandStep({
          emitHumanOutput: options.emitHumanOutput,
          onStderr: options.onStderr,
          onStdout: options.onStdout,
          step,
          workspacePath: options.workspacePath,
        })
      : await runWriteFilesStep({
          step,
          workspacePath: options.workspacePath,
        });

    results.push(result);

    if (options.emitHumanOutput && result.writtenFiles && result.writtenFiles.length > 0) {
      const labels = result.writtenFiles.map((filePath) =>
        path.relative(options.workspacePath, filePath),
      );
      options.onStdout(`wrote: ${labels.join(", ")}`);
    }
  }

  return results;
}

export default defineCommand({
  description: "Run workspace.prepare steps from lifecycle.json in the current repo.",
  input: z.object({
    json: jsonFlag,
    path: z
      .string()
      .optional()
      .describe("Repo path or lifecycle.json path. Defaults to the current directory."),
  }),
  run: async (input, context) => {
    try {
      const manifest = await loadManifest(
        input.path
          ? {
              inputPath: input.path,
            }
          : undefined,
      );

      const steps = manifest.config.workspace.prepare;
      const results =
        steps.length > 0
          ? await executePrepare({
              emitHumanOutput: !input.json,
              onStderr: context.stderr,
              onStdout: context.stdout,
              steps,
              workspacePath: manifest.workspacePath,
            })
          : [];

      const output = {
        manifestPath: manifest.manifestPath,
        stepCount: results.length,
        steps: results,
        workspacePath: manifest.workspacePath,
      };

      if (input.json) {
        context.stdout(JSON.stringify(output, null, 2));
        return 0;
      }

      if (results.length === 0) {
        context.stdout(`No workspace.prepare steps defined in ${manifest.manifestPath}.`);
        return 0;
      }

      context.stdout(`Prepared ${manifest.workspacePath} using ${results.length} step(s).`);
      return 0;
    } catch (error) {
      return failCommand(error, {
        json: input.json,
        stderr: context.stderr,
      });
    }
  },
});
