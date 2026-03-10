import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { TerminalRecord, TerminalStatus } from "@lifecycle/contracts";

export type HarnessProvider = "claude" | "codex";
export const DEFAULT_TERMINAL_COLS = 120;
export const DEFAULT_TERMINAL_ROWS = 32;
const TERMINAL_RUNTIME_UNAVAILABLE_MESSAGE = "Terminal runtime requires the Tauri desktop shell.";

export function terminalHasLiveSession(status: TerminalStatus): boolean {
  return status !== "failed" && status !== "finished";
}

export interface TerminalStreamChunk {
  cursor: string;
  data: string;
  kind: "replay" | "live";
}

interface CreateTerminalBaseInput {
  workspaceId: string;
  cols: number;
  rows: number;
}

export type CreateTerminalRequest =
  | { launchType: "shell" }
  | {
      launchType: "harness";
      harnessProvider: HarnessProvider;
      harnessSessionId?: string | null;
    };

export type CreateTerminalInput = CreateTerminalBaseInput & CreateTerminalRequest;

export interface AttachTerminalResult {
  replayCursor: string | null;
  terminal: TerminalRecord;
}

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

export interface NativeTerminalTheme {
  background: string;
  cursorColor: string;
  foreground: string;
  palette: string[];
  selectionBackground: string;
  selectionForeground: string;
}

export interface SyncNativeTerminalSurfaceInput {
  appearance: "dark" | "light";
  focused: boolean;
  fontFamily: string;
  fontSize: number;
  height: number;
  pointerPassthrough: boolean;
  scaleFactor: number;
  terminalId: string;
  theme: NativeTerminalTheme;
  visible: boolean;
  width: number;
  x: number;
  y: number;
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

  return invoke<TerminalRecord[]>("list_workspace_terminals", { workspaceId });
}

export async function getTerminal(terminalId: string): Promise<TerminalRecord | null> {
  if (!isTauri()) {
    void terminalId;
    return null;
  }

  return invoke<TerminalRecord | null>("get_terminal", { terminalId });
}

export async function createTerminal(input: CreateTerminalInput): Promise<TerminalRecord> {
  requireNativeTerminalRuntime();

  const result = await invoke<AttachTerminalResult>("create_terminal", {
    cols: input.cols,
    launchType: input.launchType,
    harnessProvider: input.launchType === "harness" ? input.harnessProvider : null,
    rows: input.rows,
    harnessSessionId:
      input.launchType === "harness" ? input.harnessSessionId?.trim() || null : null,
    workspaceId: input.workspaceId,
  });
  return result.terminal;
}

export async function renameTerminal(terminalId: string, label: string): Promise<TerminalRecord> {
  const normalizedLabel = label.trim().replace(/\s+/g, " ");
  if (normalizedLabel.length === 0) {
    throw new Error("Session title cannot be empty.");
  }

  requireNativeTerminalRuntime();

  return invoke<TerminalRecord>("rename_terminal", { terminalId, label: normalizedLabel });
}

export async function syncNativeTerminalSurface(
  input: SyncNativeTerminalSurfaceInput,
): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke<void>("sync_native_terminal_surface", {
    appearance: input.appearance,
    focused: input.focused,
    fontFamily: input.fontFamily,
    fontSize: input.fontSize,
    height: input.height,
    pointerPassthrough: input.pointerPassthrough,
    scaleFactor: input.scaleFactor,
    terminalId: input.terminalId,
    theme: input.theme,
    visible: input.visible,
    width: input.width,
    x: input.x,
    y: input.y,
  });
}

export async function hideNativeTerminalSurface(terminalId: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke<void>("hide_native_terminal_surface", { terminalId });
}

export async function attachTerminalStream(
  terminalId: string,
  cols: number,
  rows: number,
  replayCursor: string | null,
  callback: (chunk: TerminalStreamChunk) => void,
): Promise<UnlistenFn> {
  requireNativeTerminalRuntime();

  const channel = new Channel<TerminalStreamChunk>();
  channel.onmessage = callback;
  await invoke<AttachTerminalResult>("attach_terminal", {
    cols,
    handler: channel,
    replayCursor,
    rows,
    terminalId,
  });
  return () => {
    void detachTerminal(terminalId);
  };
}

export async function writeTerminal(terminalId: string, data: string): Promise<void> {
  requireNativeTerminalRuntime();

  await invoke<void>("write_terminal", { data, terminalId });
}

export async function saveTerminalAttachment(
  input: SaveTerminalAttachmentInput,
): Promise<SavedTerminalAttachment> {
  if (!isTauri()) {
    throw new Error("Image paste and drop are only available in the desktop app.");
  }

  return invoke<SavedTerminalAttachment>("save_terminal_attachment", {
    base64Data: input.base64Data,
    fileName: input.fileName,
    mediaType: input.mediaType ?? null,
    workspaceId: input.workspaceId,
  });
}

export async function resizeTerminal(
  terminalId: string,
  cols: number,
  rows: number,
): Promise<void> {
  requireNativeTerminalRuntime();

  await invoke<void>("resize_terminal", { cols, rows, terminalId });
}

export async function detachTerminal(terminalId: string): Promise<void> {
  requireNativeTerminalRuntime();

  await invoke<void>("detach_terminal", { terminalId });
}

export async function killTerminal(terminalId: string): Promise<void> {
  requireNativeTerminalRuntime();

  await invoke<void>("kill_terminal", { terminalId });
}
