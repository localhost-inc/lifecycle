import { isTauri } from "@tauri-apps/api/core";
import type { TerminalRecord, TerminalStatus } from "@lifecycle/contracts";
import { getWorkspaceProvider } from "../../lib/workspace-provider";

export type HarnessProvider = "claude" | "codex";
const TERMINAL_RUNTIME_UNAVAILABLE_MESSAGE = "Terminal runtime requires the Tauri desktop shell.";

export function terminalHasLiveSession(status: TerminalStatus): boolean {
  return status !== "failed" && status !== "finished";
}

export type CreateTerminalRequest =
  | { launchType: "shell" }
  | {
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

  return getWorkspaceProvider().listWorkspaceTerminals(workspaceId);
}

export async function getTerminal(terminalId: string): Promise<TerminalRecord | null> {
  if (!isTauri()) {
    void terminalId;
    return null;
  }

  return getWorkspaceProvider().getTerminal(terminalId);
}

export async function createTerminal(input: CreateTerminalInput): Promise<TerminalRecord> {
  requireNativeTerminalRuntime();

  return getWorkspaceProvider().createTerminal({
    launchType: input.launchType,
    harnessProvider: input.launchType === "harness" ? input.harnessProvider : null,
    harnessSessionId:
      input.launchType === "harness" ? input.harnessSessionId?.trim() || null : null,
    workspaceId: input.workspaceId,
  });
}

export async function renameTerminal(terminalId: string, label: string): Promise<TerminalRecord> {
  const normalizedLabel = label.trim().replace(/\s+/g, " ");
  if (normalizedLabel.length === 0) {
    throw new Error("Session title cannot be empty.");
  }

  requireNativeTerminalRuntime();

  return getWorkspaceProvider().renameTerminal(terminalId, normalizedLabel);
}

export async function saveTerminalAttachment(
  input: SaveTerminalAttachmentInput,
): Promise<SavedTerminalAttachment> {
  if (!isTauri()) {
    throw new Error("Image paste and drop are only available in the desktop app.");
  }

  return getWorkspaceProvider().saveTerminalAttachment(input);
}

export async function detachTerminal(terminalId: string): Promise<void> {
  requireNativeTerminalRuntime();

  await getWorkspaceProvider().detachTerminal(terminalId);
}

export async function killTerminal(terminalId: string): Promise<void> {
  requireNativeTerminalRuntime();

  await getWorkspaceProvider().killTerminal(terminalId);
}
