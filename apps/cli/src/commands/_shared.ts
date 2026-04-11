import { defineCommand, defineFlag } from "@localhost-inc/cmd";
import { LIFECYCLE_TERMINAL_ID_ENV, LIFECYCLE_WORKSPACE_ID_ENV } from "@lifecycle/contracts";
import { z } from "zod";

import { LifecycleCliError } from "../errors";

export const jsonFlag = defineFlag(
  z.boolean().default(false).describe("Emit structured JSON output."),
  { aliases: "j" },
);

export const workspaceIdFlag = z
  .string()
  .optional()
  .describe("Workspace id. If omitted, resolve from the current working directory when supported.");

export const repositoryIdFlag = z
  .string()
  .optional()
  .describe("Repository id. If omitted, resolve from local context when supported.");

export const terminalIdFlag = z
  .string()
  .optional()
  .describe("Terminal id. If omitted, resolve from the current Lifecycle-managed terminal session.");

export function resolveWorkspaceId(explicitWorkspaceId?: string): string {
  const workspaceId = explicitWorkspaceId ?? process.env[LIFECYCLE_WORKSPACE_ID_ENV];
  if (!workspaceId) {
    throw new LifecycleCliError({
      code: "workspace_unresolved",
      message: "Lifecycle could not resolve a workspace for this command.",
      suggestedAction:
        "Pass --workspace-id or run the command from a Lifecycle-launched workspace session.",
    });
  }

  return workspaceId;
}

export function resolveTerminalId(explicitTerminalId?: string): string {
  const terminalId = explicitTerminalId ?? process.env[LIFECYCLE_TERMINAL_ID_ENV];
  if (!terminalId) {
    throw new LifecycleCliError({
      code: "terminal_unresolved",
      message: "Lifecycle could not resolve a terminal for this command.",
      suggestedAction:
        "Pass --terminal-id or run the command from a Lifecycle-managed terminal session.",
    });
  }

  return terminalId;
}

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
    if (error instanceof LifecycleCliError) {
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

  if (error instanceof LifecycleCliError) {
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
    workspace_root: string | null;
  },
  stdout: (message: string) => void,
): void {
  stdout(`${workspace.name}`);
  stdout(`status: ${workspace.status}`);
  stdout(`ref: ${workspace.source_ref}`);
  if (workspace.workspace_root) {
    stdout(`path: ${workspace.workspace_root}`);
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

export function stackServices<
  T extends {
    nodes: Array<{
      assigned_port?: number | null;
      kind: string;
      name: string;
      preview_url?: string | null;
      status?: string;
      status_reason?: string | null;
    }>;
  },
>(
  stack: T,
): Array<{
  assigned_port: number | null;
  name: string;
  preview_url: string | null;
  status: string;
  status_reason: string | null;
}> {
  return stack.nodes.flatMap((node) => {
    if (node.kind !== "service") {
      return [];
    }

    return [
      {
        assigned_port: node.assigned_port ?? null,
        name: node.name,
        preview_url: node.preview_url ?? null,
        status: node.status ?? "stopped",
        status_reason: node.status_reason ?? null,
      },
    ];
  });
}
