import { defineCommand, defineFlag } from "@lifecycle/cmd";
import { z } from "zod";

import { BridgeClientError } from "../errors";

export const jsonFlag = defineFlag(
  z.boolean().default(false).describe("Emit structured JSON output."),
  { aliases: "j" },
);

export const workspaceIdFlag = z
  .string()
  .optional()
  .describe("Workspace id. If omitted, resolve from the current working directory when supported.");

export const projectIdFlag = z
  .string()
  .optional()
  .describe("Project id. If omitted, resolve from local context when supported.");

export function createStubCommand<Input extends z.ZodObject<z.ZodRawShape>>(options: {
  commandName: string;
  description: string;
  input: Input;
  validate?: (input: z.output<Input>) => string | null;
}) {
  return defineCommand({
    description: options.description,
    input: options.input,
    run: async (input, context) => {
      const validationError = options.validate?.(input);
      if (validationError) {
        context.stderr(validationError);
        return 1;
      }

      const wantsJson = "json" in input && input.json === true;
      if (wantsJson) {
        context.stderr(
          JSON.stringify(
            {
              error: {
                code: "not_implemented",
                command: options.commandName,
                message: `${options.commandName} is scaffolded but not wired yet.`,
              },
              input,
            },
            null,
            2,
          ),
        );
        return 1;
      }

      context.stderr(`Not implemented: ${options.commandName}`);
      return 1;
    },
  });
}

export function failValidation(
  message: string,
  options: {
    json: boolean;
    stderr: (message: string) => void;
  },
): number {
  if (options.json) {
    options.stderr(
      JSON.stringify(
        {
          error: {
            code: "validation_failed",
            message,
          },
        },
        null,
        2,
      ),
    );
    return 1;
  }

  options.stderr(message);
  return 1;
}

function unknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function failCommand(
  error: unknown,
  options: {
    json: boolean;
    stderr: (message: string) => void;
  },
): number {
  if (options.json) {
    if (error instanceof BridgeClientError) {
      options.stderr(
        JSON.stringify(
          {
            error: {
              code: error.code,
              details: error.details,
              message: error.message,
              retryable: error.retryable,
              suggestedAction: error.suggestedAction,
            },
          },
          null,
          2,
        ),
      );
      return 1;
    }

    options.stderr(
      JSON.stringify(
        {
          error: {
            code: "internal_error",
            message: unknownErrorMessage(error),
          },
        },
        null,
        2,
      ),
    );
    return 1;
  }

  if (error instanceof BridgeClientError) {
    options.stderr(error.message);
    if (error.suggestedAction) {
      options.stderr(`Suggested action: ${error.suggestedAction}`);
    }
    return 1;
  }

  options.stderr(unknownErrorMessage(error));
  return 1;
}

export function printWorkspaceSummary(
  workspace: {
    id: string;
    name: string;
    source_ref: string;
    status: string;
    worktree_path: string | null;
  },
  stdout: (message: string) => void,
): void {
  stdout(`${workspace.name}`);
  stdout(`status: ${workspace.status}`);
  stdout(`ref: ${workspace.source_ref}`);
  if (workspace.worktree_path) {
    stdout(`path: ${workspace.worktree_path}`);
  }
  stdout(`id: ${workspace.id}`);
}

export function printLogLine(
  line: {
    service: string;
    stream: string;
    text: string;
    timestamp: string;
  },
  stdout: (message: string) => void,
): void {
  const ts = line.timestamp.slice(11, 23);
  const prefix = line.stream === "stderr" ? `${line.service} ERR` : line.service;
  stdout(`${ts} ${prefix} ${line.text}`);
}

export function printHealthCheck(
  check: {
    healthy: boolean;
    message: string | null;
    service: string;
  },
  stdout: (message: string) => void,
): void {
  const indicator = check.healthy ? "ok" : "FAIL";
  const suffix = check.message ? ` - ${check.message}` : "";
  stdout(`${check.service}: ${indicator}${suffix}`);
}

export function printServiceSummary(
  service: {
    assigned_port: number | null;
    name: string;
    preview_url: string | null;
    status: string;
  },
  stdout: (message: string) => void,
): void {
  stdout(`${service.name}`);
  stdout(`status: ${service.status}`);
  if (service.assigned_port !== null) {
    stdout(`port: ${service.assigned_port}`);
  }
  if (service.preview_url) {
    stdout(`preview: ${service.preview_url}`);
  }
}
