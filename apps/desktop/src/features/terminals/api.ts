import { isTauri } from "@tauri-apps/api/core";
import type { TerminalRecord, TerminalStatus } from "@lifecycle/contracts";
import type { HarnessLaunchConfig } from "@/features/settings/state/harness-settings";
import { getRuntime } from "@/lib/runtime";

export type HarnessProvider = "claude" | "codex";
const TERMINAL_RUNTIME_UNAVAILABLE_MESSAGE = "Terminal runtime requires the Tauri desktop shell.";

export function terminalHasLiveSession(status: TerminalStatus): boolean {
  return status !== "failed" && status !== "finished";
}

export type CreateTerminalRequest =
  | { launchType: "shell" }
  | {
      harnessLaunchConfig?: HarnessLaunchConfig | null;
      launchType: "harness";
      harnessProvider: HarnessProvider;
      harnessSessionId?: string | null;
    };

export type CreateTerminalInput = { workspaceId: string } & CreateTerminalRequest;

export interface SaveTerminalAttachmentInput {
  base64Data: string;
  fileName: string;
  mediaType?: string | null;
  workspaceId: string;
}

export interface SavedTerminalAttachment {
  absolutePath: string;
  fileName: string;
  relativePath: string;
}

function requireNativeTerminalRuntime(): void {
  if (!isTauri()) {
    throw new Error(TERMINAL_RUNTIME_UNAVAILABLE_MESSAGE);
  }
}

export async function listWorkspaceTerminals(workspaceId: string): Promise<TerminalRecord[]> {
  if (!isTauri()) {
    void workspaceId;
    return [];
  }

  return getRuntime().listTerminals(workspaceId);
}

export async function createTerminal(input: CreateTerminalInput): Promise<TerminalRecord> {
  requireNativeTerminalRuntime();

  if (input.launchType === "harness") {
    return getRuntime().createTerminal({
      workspaceId: input.workspaceId,
      launchType: input.launchType,
      harnessLaunchConfig: input.harnessLaunchConfig ?? null,
      harnessProvider: input.harnessProvider,
      harnessSessionId: input.harnessSessionId?.trim() || null,
    });
  }

  return getRuntime().createTerminal({
    workspaceId: input.workspaceId,
    launchType: input.launchType,
    harnessProvider: null,
    harnessSessionId: null,
  });
}

export async function renameTerminal(
  workspaceId: string,
  terminalId: string,
  label: string,
): Promise<TerminalRecord> {
  const normalizedLabel = label.trim().replace(/\s+/g, " ");
  if (normalizedLabel.length === 0) {
    throw new Error("Session title cannot be empty.");
  }

  requireNativeTerminalRuntime();

  return getRuntime().renameTerminal(workspaceId, terminalId, normalizedLabel);
}

export async function saveTerminalAttachment(
  input: SaveTerminalAttachmentInput,
): Promise<SavedTerminalAttachment> {
  if (!isTauri()) {
    throw new Error("Image paste and drop are only available in the desktop app.");
  }

  return getRuntime().saveTerminalAttachment(input);
}

export async function detachTerminal(workspaceId: string, terminalId: string): Promise<void> {
  requireNativeTerminalRuntime();

  await getRuntime().detachTerminal(workspaceId, terminalId);
}

export async function killTerminal(workspaceId: string, terminalId: string): Promise<void> {
  requireNativeTerminalRuntime();

  await getRuntime().killTerminal(workspaceId, terminalId);
}

export async function interruptTerminal(workspaceId: string, terminalId: string): Promise<void> {
  requireNativeTerminalRuntime();

  await getRuntime().interruptTerminal(workspaceId, terminalId);
}
