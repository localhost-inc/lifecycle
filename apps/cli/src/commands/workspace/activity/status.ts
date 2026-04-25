import { defineCommand } from "@localhost-inc/cmd";
import { ensureBridge } from "@/bridge";
import type {
  WorkspaceActivitySummary,
  WorkspaceActivityTerminalRecord,
} from "@lifecycle/contracts";
import { z } from "zod";

import { failCommand, jsonFlag, resolveWorkspaceId, workspaceIdFlag } from "../../_shared";

function printTerminalActivity(
  terminal: WorkspaceActivityTerminalRecord,
  stdout: (message: string) => void,
): void {
  stdout(terminal.terminal_id);
  stdout(`state: ${terminal.state}`);
  stdout(`source: ${terminal.source}`);
  stdout(`busy: ${terminal.busy ? "yes" : "no"}`);
  if (terminal.provider) {
    stdout(`provider: ${terminal.provider}`);
  }
  if (terminal.turn_id) {
    stdout(`turn: ${terminal.turn_id}`);
  }
  if (terminal.tool_name) {
    stdout(`tool: ${terminal.tool_name}`);
  }
  if (terminal.waiting_kind) {
    stdout(`waiting: ${terminal.waiting_kind}`);
  }
  if (terminal.updated_at) {
    stdout(`updated: ${terminal.updated_at}`);
  }
}

function printWorkspaceActivity(
  summary: WorkspaceActivitySummary,
  stdout: (message: string) => void,
): void {
  stdout(`workspace: ${summary.workspace_id}`);
  stdout(`busy: ${summary.busy ? "yes" : "no"}`);
  if (summary.updated_at) {
    stdout(`updated: ${summary.updated_at}`);
  }

  if (summary.terminals.length === 0) {
    stdout("No terminal activity.");
    return;
  }

  for (const [index, terminal] of summary.terminals.entries()) {
    stdout("");
    printTerminalActivity(terminal, stdout);
    if (index === summary.terminals.length - 1) {
      continue;
    }
  }
}

export default defineCommand({
  description: "Show bridge-owned activity state for a workspace and its terminals.",
  input: z.object({
    json: jsonFlag,
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const { client } = await ensureBridge();
      const response = await client.workspaces[":id"].activity.$get({
        param: { id: workspaceId },
      });
      const result = await response.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
        return 0;
      }

      printWorkspaceActivity(result, context.stdout);
      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
