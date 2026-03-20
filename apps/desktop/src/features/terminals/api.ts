import { isTauri } from "@tauri-apps/api/core";
import type { TerminalRecord, TerminalStatus } from "@lifecycle/contracts";
import type { HarnessLaunchConfig } from "@/features/settings/state/harness-settings";
import { getWorkspaceRuntime } from "@/lib/workspace-runtime";

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

  return getWorkspaceRuntime().listTerminals(workspaceId);
}

export async function getTerminal(terminalId: string): Promise<TerminalRecord | null> {
  if (!isTauri()) {
    void terminalId;
    return null;
  }

  return getWorkspaceRuntime().getTerminal(terminalId);
}

export async function createTerminal(input: CreateTerminalInput): Promise<TerminalRecord> {
  requireNativeTerminalRuntime();

  if (input.launchType === "harness") {
    return getWorkspaceRuntime().createTerminal({
      workspaceId: input.workspaceId,
      launchType: input.launchType,
      harnessLaunchConfig: input.harnessLaunchConfig ?? null,
      harnessProvider: input.harnessProvider,
      harnessSessionId: input.harnessSessionId?.trim() || null,
    });
  }

  return getWorkspaceRuntime().createTerminal({
    workspaceId: input.workspaceId,
    launchType: input.launchType,
    harnessProvider: null,
    harnessSessionId: null,
  });
}

export async function renameTerminal(terminalId: string, label: string): Promise<TerminalRecord> {
  const normalizedLabel = label.trim().replace(/\s+/g, " ");
  if (normalizedLabel.length === 0) {
    throw new Error("Session title cannot be empty.");
  }

  requireNativeTerminalRuntime();

  return getWorkspaceRuntime().renameTerminal(terminalId, normalizedLabel);
}

export async function saveTerminalAttachment(
  input: SaveTerminalAttachmentInput,
): Promise<SavedTerminalAttachment> {
  if (!isTauri()) {
    throw new Error("Image paste and drop are only available in the desktop app.");
  }

  return getWorkspaceRuntime().saveTerminalAttachment(input);
}

export async function detachTerminal(terminalId: string): Promise<void> {
  requireNativeTerminalRuntime();

  await getWorkspaceRuntime().detachTerminal(terminalId);
}

export async function killTerminal(terminalId: string): Promise<void> {
  requireNativeTerminalRuntime();

  await getWorkspaceRuntime().killTerminal(terminalId);
}

export async function interruptTerminal(terminalId: string): Promise<void> {
  requireNativeTerminalRuntime();

  await getWorkspaceRuntime().interruptTerminal(terminalId);
}
