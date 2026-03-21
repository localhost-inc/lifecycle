import { isTauri } from "@tauri-apps/api/core";
import type { TerminalRecord, TerminalStatus } from "@lifecycle/contracts";
import type { HarnessLaunchConfig } from "@/features/settings/state/harness-settings";
import { getWorkspaceClient } from "@/lib/workspace";

export type HarnessProvider = "claude" | "codex";
const TERMINAL_ACCESS_UNAVAILABLE_MESSAGE = "Terminal access requires the Tauri desktop shell.";

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

function requireDesktopTerminalAccess(): void {
  if (!isTauri()) {
    throw new Error(TERMINAL_ACCESS_UNAVAILABLE_MESSAGE);
  }
}

export async function listWorkspaceTerminals(workspaceId: string): Promise<TerminalRecord[]> {
  if (!isTauri()) {
    void workspaceId;
    return [];
  }

  return getWorkspaceClient().listTerminals(workspaceId);
}

export async function createTerminal(input: CreateTerminalInput): Promise<TerminalRecord> {
  requireDesktopTerminalAccess();

  if (input.launchType === "harness") {
    return getWorkspaceClient().createTerminal({
      workspaceId: input.workspaceId,
      launchType: input.launchType,
      harnessLaunchConfig: input.harnessLaunchConfig ?? null,
      harnessProvider: input.harnessProvider,
      harnessSessionId: input.harnessSessionId?.trim() || null,
    });
  }

  return getWorkspaceClient().createTerminal({
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

  requireDesktopTerminalAccess();

  return getWorkspaceClient().renameTerminal(workspaceId, terminalId, normalizedLabel);
}

export async function saveTerminalAttachment(
  input: SaveTerminalAttachmentInput,
): Promise<SavedTerminalAttachment> {
  if (!isTauri()) {
    throw new Error("Image paste and drop are only available in the desktop app.");
  }

  return getWorkspaceClient().saveTerminalAttachment(input);
}

export async function detachTerminal(workspaceId: string, terminalId: string): Promise<void> {
  requireDesktopTerminalAccess();

  await getWorkspaceClient().detachTerminal(workspaceId, terminalId);
}

export async function killTerminal(workspaceId: string, terminalId: string): Promise<void> {
  requireDesktopTerminalAccess();

  await getWorkspaceClient().killTerminal(workspaceId, terminalId);
}

export async function interruptTerminal(workspaceId: string, terminalId: string): Promise<void> {
  requireDesktopTerminalAccess();

  await getWorkspaceClient().interruptTerminal(workspaceId, terminalId);
}
