import { isTauri } from "@tauri-apps/api/core";
import type { TerminalRecord, TerminalStatus } from "@lifecycle/contracts";
import type { WorkspaceRuntime } from "@lifecycle/workspace";
const TERMINAL_ACCESS_UNAVAILABLE_MESSAGE = "Terminal access requires the Tauri desktop shell.";

export function terminalHasLiveSession(status: TerminalStatus): boolean {
  return status !== "failed" && status !== "finished";
}

export type CreateTerminalRequest = { launchType: "shell" };

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

export async function listWorkspaceTerminals(
  runtime: WorkspaceRuntime,
  workspaceId: string,
): Promise<TerminalRecord[]> {
  if (!isTauri()) {
    void workspaceId;
    return [];
  }

  return runtime.listTerminals(workspaceId);
}

export async function createTerminal(
  runtime: WorkspaceRuntime,
  input: CreateTerminalInput,
): Promise<TerminalRecord> {
  requireDesktopTerminalAccess();

  return runtime.createTerminal({
    workspaceId: input.workspaceId,
    launchType: input.launchType,
  });
}

export async function renameTerminal(
  runtime: WorkspaceRuntime,
  workspaceId: string,
  terminalId: string,
  label: string,
): Promise<TerminalRecord> {
  const normalizedLabel = label.trim().replace(/\s+/g, " ");
  if (normalizedLabel.length === 0) {
    throw new Error("Session title cannot be empty.");
  }

  requireDesktopTerminalAccess();

  return runtime.renameTerminal(workspaceId, terminalId, normalizedLabel);
}

export async function sendTerminalText(
  runtime: WorkspaceRuntime,
  workspaceId: string,
  terminalId: string,
  text: string,
): Promise<void> {
  if (text.length === 0) {
    return;
  }

  requireDesktopTerminalAccess();
  await runtime.sendTerminalText(workspaceId, terminalId, text);
}

export async function saveTerminalAttachment(
  runtime: WorkspaceRuntime,
  input: SaveTerminalAttachmentInput,
): Promise<SavedTerminalAttachment> {
  if (!isTauri()) {
    throw new Error("Image paste and drop are only available in the desktop app.");
  }

  return runtime.saveTerminalAttachment(input);
}

export async function detachTerminal(
  runtime: WorkspaceRuntime,
  workspaceId: string,
  terminalId: string,
): Promise<void> {
  requireDesktopTerminalAccess();

  await runtime.detachTerminal(workspaceId, terminalId);
}

export async function killTerminal(
  runtime: WorkspaceRuntime,
  workspaceId: string,
  terminalId: string,
): Promise<void> {
  requireDesktopTerminalAccess();

  await runtime.killTerminal(workspaceId, terminalId);
}

export async function interruptTerminal(
  runtime: WorkspaceRuntime,
  workspaceId: string,
  terminalId: string,
): Promise<void> {
  requireDesktopTerminalAccess();

  await runtime.interruptTerminal(workspaceId, terminalId);
}
