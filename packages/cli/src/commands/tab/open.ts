import { defineCommand } from "@lifecycle/cmd";
import { z } from "zod";

import {
  createTabOpenPreviewRequest,
  formatTabOpenResult,
  requestBridge,
  resolveWorkspaceId,
} from "../../bridge";
import { failCommand, failValidation, jsonFlag, workspaceIdFlag } from "../_shared";

const workspaceSurface = z.enum([
  "changes-diff",
  "commit-diff",
  "file",
  "preview",
  "pull-request",
  "terminal",
]);

function validateTabOpenInput(input: {
  commitSha?: string | undefined;
  filePath?: string | undefined;
  pane?: string | undefined;
  pullRequestNumber?: number | undefined;
  split: boolean;
  surface: z.infer<typeof workspaceSurface>;
  url?: string | undefined;
}): string | null {
  if (input.surface === "preview" && !input.url) {
    return "--surface preview requires --url.";
  }

  if (input.surface === "preview" && input.pane) {
    return "--pane is not implemented for preview tab opens yet.";
  }

  if (input.surface === "preview" && input.split) {
    return "--split is not implemented for preview tab opens yet.";
  }

  if (input.surface === "file" && !input.filePath) {
    return "--surface file requires --file-path.";
  }

  if (input.surface === "commit-diff" && !input.commitSha) {
    return "--surface commit-diff requires --commit-sha.";
  }

  if (input.surface === "pull-request" && input.pullRequestNumber === undefined) {
    return "--surface pull-request requires --pull-request-number.";
  }

  if (input.surface !== "preview") {
    return `lifecycle tab open --surface ${input.surface} is not wired yet.`;
  }

  return null;
}

export default defineCommand({
  description: "Open or focus a workspace surface in the desktop app.",
  input: z.object({
    commitSha: z.string().optional().describe("Commit sha for commit diff surfaces."),
    filePath: z.string().optional().describe("Workspace-relative file path."),
    focusPath: z.string().optional().describe("File path to focus inside a diff surface."),
    harness: z
      .enum(["claude", "codex", "shell"])
      .optional()
      .describe("Harness or terminal type when opening a terminal surface."),
    json: jsonFlag,
    pane: z.string().optional().describe("Target pane id or selector."),
    pullRequestNumber: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe("Pull request number for PR surfaces."),
    select: z.boolean().default(true).describe("Select the opened surface."),
    split: z.boolean().default(false).describe("Open in a split pane."),
    surface: workspaceSurface.describe("Surface kind to open."),
    terminalId: z.string().optional().describe("Existing terminal id to focus."),
    url: z.string().optional().describe("URL to open for preview surfaces."),
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    const validationError = validateTabOpenInput(input);
    if (validationError) {
      return failValidation(validationError, {
        json: input.json,
        stderr: context.stderr,
      });
    }

    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const response = await requestBridge(
        createTabOpenPreviewRequest({
          select: input.select,
          split: input.split,
          url: input.url ?? "",
          workspaceId,
        }),
      );

      if (input.json) {
        context.stdout(JSON.stringify(response.result, null, 2));
        return 0;
      }

      context.stdout(formatTabOpenResult(response.result));
      return 0;
    } catch (error) {
      return failCommand(error, {
        json: input.json,
        stderr: context.stderr,
      });
    }
  },
});
