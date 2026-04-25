import { defineCommand } from "@localhost-inc/cmd";
import { ensureBridge } from "@/bridge";
import type { WorkspaceActivityEventName } from "@lifecycle/contracts";
import { z } from "zod";

import {
  failCommand,
  jsonFlag,
  resolveTerminalId,
  resolveWorkspaceId,
  terminalIdFlag,
  workspaceIdFlag,
} from "../../_shared";
import { LifecycleCliError } from "../../../errors";

const HOOK_PROMPT_KEYS = ["prompt", "input", "message", "text", "userPrompt"];
const HOOK_PROMPT_STDIN_TIMEOUT_MS = 250;

function parseMetadata(raw?: string): Record<string, unknown> | undefined {
  if (!raw) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new LifecycleCliError({
      code: "metadata_invalid",
      message: `Could not parse --metadata as JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
      suggestedAction: 'Pass a JSON object, for example --metadata \'{"source":"hook"}\'.',
    });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new LifecycleCliError({
      code: "metadata_invalid",
      message: "Lifecycle activity metadata must be a JSON object.",
      suggestedAction: 'Pass a JSON object, for example --metadata \'{"source":"hook"}\'.',
    });
  }

  return parsed as Record<string, unknown>;
}

async function readHookPromptFromStdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) {
    return undefined;
  }

  const raw = await readStdinWithTimeout(HOOK_PROMPT_STDIN_TIMEOUT_MS);
  if (!raw.trim()) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }

  return extractHookPrompt(parsed);
}

async function readStdinWithTimeout(timeoutMs: number): Promise<string> {
  const reader = Bun.stdin.stream().getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel();
  }, timeoutMs);

  try {
    while (!timedOut) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      chunks.push(decoder.decode(next.value, { stream: true }));
    }
    chunks.push(decoder.decode());
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }

  return timedOut ? "" : chunks.join("");
}

export function extractHookPrompt(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  for (const key of HOOK_PROMPT_KEYS) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  for (const key of ["event", "payload", "properties", "session", "user_prompt"]) {
    const prompt = extractHookPrompt((payload as Record<string, unknown>)[key]);
    if (prompt) {
      return prompt;
    }
  }

  return undefined;
}

export default defineCommand({
  description: "Emit an explicit activity event for the current Lifecycle-managed terminal.",
  input: z.object({
    args: z.array(z.string()).describe("<event>"),
    json: jsonFlag,
    kind: z.string().trim().min(1).optional(),
    metadata: z.string().optional().describe("Optional JSON object to attach as event metadata."),
    name: z.string().trim().min(1).optional(),
    prompt: z.string().trim().min(1).optional(),
    provider: z.string().trim().min(1).optional(),
    terminalId: terminalIdFlag,
    turnId: z.string().trim().min(1).optional(),
    workspaceId: workspaceIdFlag,
  }),
  run: async (input, context) => {
    try {
      const [event] = input.args;
      if (!event || input.args.length !== 1) {
        context.stderr("Usage: lifecycle workspace activity emit <event>");
        return 1;
      }

      const workspaceId = resolveWorkspaceId(input.workspaceId);
      const terminalId = resolveTerminalId(input.terminalId);
      const metadata = parseMetadata(input.metadata);
      const prompt = input.prompt ?? (await readHookPromptFromStdin());
      const { client } = await ensureBridge();
      const response = await client.workspaces[":id"].activity.$post({
        param: { id: workspaceId },
        json: {
          event: event as WorkspaceActivityEventName,
          ...(input.kind ? { kind: input.kind } : {}),
          ...(metadata ? { metadata } : {}),
          ...(input.name ? { name: input.name } : {}),
          ...(prompt ? { prompt } : {}),
          ...(input.provider ? { provider: input.provider } : {}),
          terminalId,
          ...(input.turnId ? { turnId: input.turnId } : {}),
        },
      });
      const result = await response.json();

      if (input.json) {
        context.stdout(JSON.stringify(result, null, 2));
      }

      return 0;
    } catch (error) {
      return failCommand(error, { json: input.json, stderr: context.stderr });
    }
  },
});
