import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { TerminalFailureReason, TerminalStatus, TerminalType } from "@lifecycle/contracts";

export type HarnessProvider = "claude" | "codex";
export const DEFAULT_HARNESS_PROVIDER: HarnessProvider = "claude";
export const DEFAULT_TERMINAL_COLS = 120;
export const DEFAULT_TERMINAL_ROWS = 32;

export function terminalHasLiveSession(status: TerminalStatus): boolean {
  return status !== "failed" && status !== "finished";
}

export interface TerminalRow {
  id: string;
  workspace_id: string;
  launch_type: TerminalType;
  harness_provider: string | null;
  harness_session_id: string | null;
  created_by: string | null;
  label: string;
  status: TerminalStatus;
  failure_reason: TerminalFailureReason | null;
  exit_code: number | null;
  started_at: string;
  last_active_at: string;
  ended_at: string | null;
}

export interface TerminalCreatedEvent {
  workspace_id: string;
  terminal: TerminalRow;
}

export interface TerminalStatusEvent {
  terminal_id: string;
  workspace_id: string;
  status: TerminalStatus;
  failure_reason: TerminalFailureReason | null;
  exit_code: number | null;
  ended_at: string | null;
}

export interface TerminalRemovedEvent {
  terminal_id: string;
  workspace_id: string;
}

export interface TerminalHarnessTurnCompletedEvent {
  terminal_id: string;
  workspace_id: string;
  harness_provider: string | null;
  harness_session_id: string | null;
  completion_key: string;
  turn_id: string | null;
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
  terminal: TerminalRow;
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

export interface NativeTerminalCapabilities {
  available: boolean;
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

interface BrowserReplayChunk {
  cursor: string;
  data: string;
}

interface BrowserTerminalState {
  nextReplayCursor: number;
  nextSequence: number;
  inputByTerminalId: Record<string, string>;
  replayByTerminalId: Record<string, BrowserReplayChunk[]>;
  terminals: TerminalRow[];
}

interface BrowserTerminalListeners {
  created: Set<(event: TerminalCreatedEvent) => void>;
  harnessTurnCompleted: Set<(event: TerminalHarnessTurnCompletedEvent) => void>;
  removed: Set<(event: TerminalRemovedEvent) => void>;
  status: Set<(event: TerminalStatusEvent) => void>;
}

interface BrowserTerminalCommandResult {
  clear?: boolean;
  exitCode?: number;
  finish?: boolean;
  output: string;
}

const BROWSER_TERMINALS_STORAGE_KEY = "lifecycle.desktop.browser.terminals.v1";
const BROWSER_TERMINAL_REPLAY_LIMIT = 400;

let nativeTerminalCapabilitiesPromise: Promise<NativeTerminalCapabilities> | null = null;

let browserTerminalState = readBrowserTerminalState();

const browserListeners: BrowserTerminalListeners = {
  created: new Set(),
  harnessTurnCompleted: new Set(),
  removed: new Set(),
  status: new Set(),
};

const browserStreamListeners = new Map<string, Set<(chunk: TerminalStreamChunk) => void>>();

function readBrowserTerminalState(): BrowserTerminalState {
  if (typeof window === "undefined") {
    return {
      inputByTerminalId: {},
      nextReplayCursor: 1,
      nextSequence: 1,
      replayByTerminalId: {},
      terminals: [],
    };
  }

  const raw = window.localStorage.getItem(BROWSER_TERMINALS_STORAGE_KEY);
  if (!raw) {
    return {
      inputByTerminalId: {},
      nextReplayCursor: 1,
      nextSequence: 1,
      replayByTerminalId: {},
      terminals: [],
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BrowserTerminalState>;
    const normalizedReplay = normalizeBrowserReplayState(
      parsed.replayByTerminalId,
      typeof parsed.nextReplayCursor === "number" ? parsed.nextReplayCursor : 1,
    );
    return {
      inputByTerminalId:
        parsed.inputByTerminalId && typeof parsed.inputByTerminalId === "object"
          ? parsed.inputByTerminalId
          : {},
      nextReplayCursor: normalizedReplay.nextReplayCursor,
      nextSequence: typeof parsed.nextSequence === "number" ? parsed.nextSequence : 1,
      replayByTerminalId: normalizedReplay.replayByTerminalId,
      terminals: Array.isArray(parsed.terminals) ? parsed.terminals : [],
    };
  } catch {
    return {
      inputByTerminalId: {},
      nextReplayCursor: 1,
      nextSequence: 1,
      replayByTerminalId: {},
      terminals: [],
    };
  }
}

function persistBrowserTerminalState(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(BROWSER_TERMINALS_STORAGE_KEY, JSON.stringify(browserTerminalState));
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseReplayCursor(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBrowserReplayState(
  replayByTerminalId: unknown,
  initialReplayCursor: number,
): Pick<BrowserTerminalState, "nextReplayCursor" | "replayByTerminalId"> {
  let nextReplayCursor =
    Number.isFinite(initialReplayCursor) && initialReplayCursor > 0 ? initialReplayCursor : 1;
  const normalizedReplayByTerminalId: Record<string, BrowserReplayChunk[]> = {};

  if (!replayByTerminalId || typeof replayByTerminalId !== "object") {
    return {
      nextReplayCursor,
      replayByTerminalId: normalizedReplayByTerminalId,
    };
  }

  for (const [terminalId, rawChunks] of Object.entries(
    replayByTerminalId as Record<string, unknown>,
  )) {
    if (!Array.isArray(rawChunks)) {
      continue;
    }

    const normalizedChunks: BrowserReplayChunk[] = [];
    for (const rawChunk of rawChunks.slice(-BROWSER_TERMINAL_REPLAY_LIMIT)) {
      if (typeof rawChunk === "string") {
        normalizedChunks.push({
          cursor: String(nextReplayCursor),
          data: rawChunk,
        });
        nextReplayCursor += 1;
        continue;
      }

      if (!rawChunk || typeof rawChunk !== "object") {
        continue;
      }

      const data = "data" in rawChunk && typeof rawChunk.data === "string" ? rawChunk.data : null;
      if (data === null) {
        continue;
      }

      const rawCursor =
        "cursor" in rawChunk && typeof rawChunk.cursor === "string" ? rawChunk.cursor : null;
      const parsedCursor = parseReplayCursor(rawCursor);
      const cursor = parsedCursor === null ? nextReplayCursor : parsedCursor;
      normalizedChunks.push({
        cursor: String(cursor),
        data,
      });
      nextReplayCursor = Math.max(nextReplayCursor, cursor + 1);
    }

    normalizedReplayByTerminalId[terminalId] = normalizedChunks;
  }

  return {
    nextReplayCursor,
    replayByTerminalId: normalizedReplayByTerminalId,
  };
}

function buildHarnessPrompt(harnessProvider: string | null): string {
  if (harnessProvider === "claude") {
    return "claude> ";
  }

  if (harnessProvider === "codex") {
    return "codex> ";
  }

  return "lifecycle$ ";
}

function buildTerminalLabel(input: CreateTerminalRequest, sequence: number): string {
  if (input.launchType !== "harness") {
    return `Terminal ${sequence}`;
  }

  const resumeLabel = input.harnessSessionId
    ? `Resume ${input.harnessSessionId.slice(0, 8)}`
    : `Session ${sequence}`;

  if (input.harnessProvider === "claude") {
    return `Claude · ${resumeLabel}`;
  }

  if (input.harnessProvider === "codex") {
    return `Codex · ${resumeLabel}`;
  }

  return `Harness · ${resumeLabel}`;
}

function emitTerminalCreated(event: TerminalCreatedEvent): void {
  for (const callback of browserListeners.created) {
    callback(event);
  }
}

function emitTerminalStatus(event: TerminalStatusEvent): void {
  for (const callback of browserListeners.status) {
    callback(event);
  }
}

function emitTerminalHarnessTurnCompleted(event: TerminalHarnessTurnCompletedEvent): void {
  for (const callback of browserListeners.harnessTurnCompleted) {
    callback(event);
  }
}

function emitTerminalChunk(terminalId: string, chunk: TerminalStreamChunk): void {
  const listeners = browserStreamListeners.get(terminalId);
  if (!listeners) {
    return;
  }

  for (const callback of listeners) {
    callback(chunk);
  }
}

function updateBrowserTerminal(
  terminalId: string,
  updater: (terminal: TerminalRow) => TerminalRow,
): TerminalRow | null {
  let nextTerminal: TerminalRow | null = null;
  browserTerminalState = {
    ...browserTerminalState,
    terminals: browserTerminalState.terminals.map((terminal) => {
      if (terminal.id !== terminalId) {
        return terminal;
      }

      nextTerminal = updater(terminal);
      return nextTerminal;
    }),
  };
  persistBrowserTerminalState();
  return nextTerminal;
}

function setBrowserTerminalStatus(
  terminalId: string,
  status: TerminalStatus,
  options?: {
    endedAt?: string | null;
    exitCode?: number | null;
    failureReason?: TerminalFailureReason | null;
  },
): TerminalRow | null {
  const nextTerminal = updateBrowserTerminal(terminalId, (terminal) => ({
    ...terminal,
    ended_at: options?.endedAt === undefined ? terminal.ended_at : options.endedAt,
    exit_code: options?.exitCode === undefined ? terminal.exit_code : options.exitCode,
    failure_reason:
      options?.failureReason === undefined ? terminal.failure_reason : options.failureReason,
    last_active_at: nowIso(),
    status,
  }));

  if (nextTerminal) {
    emitTerminalStatus({
      ended_at: nextTerminal.ended_at,
      exit_code: nextTerminal.exit_code,
      failure_reason: nextTerminal.failure_reason,
      status: nextTerminal.status,
      terminal_id: nextTerminal.id,
      workspace_id: nextTerminal.workspace_id,
    });
  }

  return nextTerminal;
}

function emitBrowserHarnessTurnCompleted(
  terminal: TerminalRow,
  turnId: string | null = null,
): void {
  if (terminal.launch_type !== "harness") {
    return;
  }

  emitTerminalHarnessTurnCompleted({
    completion_key:
      turnId ??
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    harness_provider: terminal.harness_provider,
    harness_session_id: terminal.harness_session_id,
    terminal_id: terminal.id,
    turn_id: turnId,
    workspace_id: terminal.workspace_id,
  });
}

function appendBrowserTerminalOutput(
  terminalId: string,
  data: string,
  kind: "replay" | "live",
): void {
  const chunk: BrowserReplayChunk = {
    cursor: String(browserTerminalState.nextReplayCursor),
    data,
  };
  const existingReplay = browserTerminalState.replayByTerminalId[terminalId] ?? [];
  const nextReplay = [...existingReplay, chunk].slice(-BROWSER_TERMINAL_REPLAY_LIMIT);
  browserTerminalState = {
    ...browserTerminalState,
    nextReplayCursor: browserTerminalState.nextReplayCursor + 1,
    replayByTerminalId: {
      ...browserTerminalState.replayByTerminalId,
      [terminalId]: nextReplay,
    },
  };
  persistBrowserTerminalState();
  emitTerminalChunk(terminalId, { ...chunk, kind });
}

function buildTerminalBanner(terminal: TerminalRow): string {
  const prompt = buildHarnessPrompt(terminal.harness_provider);

  if (terminal.launch_type === "harness" && terminal.harness_provider === "claude") {
    return [
      terminal.harness_session_id
        ? `Claude Code resumed session ${terminal.harness_session_id.slice(0, 8)}.`
        : "Claude Code attached to this workspace.",
      "This is a browser-mode simulator for Milestone 3.",
      "Try: help, pwd, ls, echo hello, exit",
      "",
      prompt,
    ].join("\r\n");
  }

  if (terminal.launch_type === "harness" && terminal.harness_provider === "codex") {
    return [
      terminal.harness_session_id
        ? `Codex resumed session ${terminal.harness_session_id.slice(0, 8)}.`
        : "Codex attached to this workspace.",
      "This is a browser-mode simulator for Milestone 3.",
      "Try: help, pwd, ls, echo hello, exit",
      "",
      prompt,
    ].join("\r\n");
  }

  return [
    `Lifecycle shell attached to workspace ${terminal.workspace_id}.`,
    "This is a browser-mode simulator for Milestone 3.",
    "Try: help, pwd, ls, echo hello, exit",
    "",
    prompt,
  ].join("\r\n");
}

export function evaluateBrowserTerminalCommand(
  command: string,
  terminal: Pick<TerminalRow, "launch_type" | "harness_provider" | "workspace_id">,
): BrowserTerminalCommandResult {
  const trimmed = command.trim();
  const prompt = buildHarnessPrompt(terminal.harness_provider);

  if (!trimmed) {
    return { output: prompt };
  }

  if (trimmed === "help") {
    return {
      output: [
        "Available commands:",
        "  help",
        "  pwd",
        "  ls",
        "  echo <text>",
        "  date",
        "  clear",
        "  exit",
        "",
        prompt,
      ].join("\r\n"),
    };
  }

  if (trimmed === "pwd") {
    return {
      output: [`/workspaces/${terminal.workspace_id}`, "", prompt].join("\r\n"),
    };
  }

  if (trimmed === "ls") {
    return {
      output: ["README.md  apps/  docs/  lifecycle.json  packages/", "", prompt].join("\r\n"),
    };
  }

  if (trimmed === "date") {
    return {
      output: [new Date().toString(), "", prompt].join("\r\n"),
    };
  }

  if (trimmed === "clear") {
    return {
      clear: true,
      output: `\u001Bc${prompt}`,
    };
  }

  if (trimmed === "exit") {
    return {
      exitCode: 0,
      finish: true,
      output: "Session finished.\r\n",
    };
  }

  if (trimmed.startsWith("echo ")) {
    return {
      output: [`${trimmed.slice(5)}`, "", prompt].join("\r\n"),
    };
  }

  return {
    output: [`${trimmed}: command not found`, "", prompt].join("\r\n"),
  };
}

function createBrowserTerminal(input: CreateTerminalInput): TerminalRow {
  const sequence = browserTerminalState.nextSequence;
  const terminal: TerminalRow = {
    created_by: null,
    ended_at: null,
    exit_code: null,
    failure_reason: null,
    harness_provider: input.launchType === "harness" ? input.harnessProvider : null,
    harness_session_id:
      input.launchType === "harness" ? input.harnessSessionId?.trim() || null : null,
    id: crypto.randomUUID(),
    label: buildTerminalLabel(input, sequence),
    last_active_at: nowIso(),
    launch_type: input.launchType,
    started_at: nowIso(),
    status: "active",
    workspace_id: input.workspaceId,
  };

  browserTerminalState = {
    ...browserTerminalState,
    inputByTerminalId: {
      ...browserTerminalState.inputByTerminalId,
      [terminal.id]: "",
    },
    nextSequence: sequence + 1,
    replayByTerminalId: {
      ...browserTerminalState.replayByTerminalId,
      [terminal.id]: [],
    },
    terminals: [terminal, ...browserTerminalState.terminals],
  };
  persistBrowserTerminalState();
  emitTerminalCreated({
    terminal,
    workspace_id: terminal.workspace_id,
  });
  appendBrowserTerminalOutput(terminal.id, buildTerminalBanner(terminal), "live");
  return terminal;
}

export async function listWorkspaceTerminals(workspaceId: string): Promise<TerminalRow[]> {
  if (!isTauri()) {
    return browserTerminalState.terminals.filter(
      (terminal) => terminal.workspace_id === workspaceId,
    );
  }

  return invoke<TerminalRow[]>("list_workspace_terminals", { workspaceId });
}

export async function getTerminal(terminalId: string): Promise<TerminalRow | null> {
  if (!isTauri()) {
    return browserTerminalState.terminals.find((terminal) => terminal.id === terminalId) ?? null;
  }

  return invoke<TerminalRow | null>("get_terminal", { terminalId });
}

export async function createTerminal(input: CreateTerminalInput): Promise<TerminalRow> {
  if (!isTauri()) {
    return createBrowserTerminal(input);
  }

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

export async function getNativeTerminalCapabilities(): Promise<NativeTerminalCapabilities> {
  if (!isTauri()) {
    return { available: false };
  }

  if (!nativeTerminalCapabilitiesPromise) {
    nativeTerminalCapabilitiesPromise = invoke<NativeTerminalCapabilities>(
      "native_terminal_capabilities",
    );
  }

  return nativeTerminalCapabilitiesPromise;
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
  if (!isTauri()) {
    const terminal = browserTerminalState.terminals.find((item) => item.id === terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${terminalId}`);
    }

    if (terminal.status === "detached") {
      setBrowserTerminalStatus(terminalId, "active");
    }

    const replay = browserTerminalState.replayByTerminalId[terminalId] ?? [];
    const parsedReplayCursor = parseReplayCursor(replayCursor);
    for (const chunk of replay) {
      const chunkCursor = parseReplayCursor(chunk.cursor);
      if (
        parsedReplayCursor !== null &&
        chunkCursor !== null &&
        chunkCursor <= parsedReplayCursor
      ) {
        continue;
      }

      callback({ ...chunk, kind: "replay" });
    }

    const listeners = browserStreamListeners.get(terminalId) ?? new Set();
    listeners.add(callback);
    browserStreamListeners.set(terminalId, listeners);

    return () => {
      const nextListeners = browserStreamListeners.get(terminalId);
      nextListeners?.delete(callback);
      if (nextListeners && nextListeners.size === 0) {
        browserStreamListeners.delete(terminalId);
      }
    };
  }

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
  if (!isTauri()) {
    const terminal = browserTerminalState.terminals.find((item) => item.id === terminalId);
    if (!terminal || terminal.status !== "active") {
      return;
    }

    let inputBuffer = browserTerminalState.inputByTerminalId[terminalId] ?? "";
    for (const char of data) {
      if (char === "\n" || char === "\u001B") {
        continue;
      }

      if (char === "\u0003") {
        inputBuffer = "";
        appendBrowserTerminalOutput(terminalId, "^C\r\n", "live");
        appendBrowserTerminalOutput(
          terminalId,
          buildHarnessPrompt(terminal.harness_provider),
          "live",
        );
        continue;
      }

      if (char === "\u007F") {
        if (inputBuffer.length === 0) {
          continue;
        }

        inputBuffer = inputBuffer.slice(0, -1);
        appendBrowserTerminalOutput(terminalId, "\b \b", "live");
        continue;
      }

      if (char === "\r") {
        appendBrowserTerminalOutput(terminalId, "\r\n", "live");
        const result = evaluateBrowserTerminalCommand(inputBuffer, terminal);
        inputBuffer = "";
        appendBrowserTerminalOutput(terminalId, result.output, "live");

        if (result.finish) {
          setBrowserTerminalStatus(terminalId, "finished", {
            endedAt: nowIso(),
            exitCode: result.exitCode ?? 0,
          });
        } else if (terminal.launch_type === "harness") {
          emitBrowserHarnessTurnCompleted(terminal);
        }
        continue;
      }

      inputBuffer += char;
      appendBrowserTerminalOutput(terminalId, char, "live");
    }

    browserTerminalState = {
      ...browserTerminalState,
      inputByTerminalId: {
        ...browserTerminalState.inputByTerminalId,
        [terminalId]: inputBuffer,
      },
    };
    persistBrowserTerminalState();
    return;
  }

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
  if (!isTauri()) {
    return;
  }

  await invoke<void>("resize_terminal", { cols, rows, terminalId });
}

export async function detachTerminal(terminalId: string): Promise<void> {
  if (!isTauri()) {
    const terminal = browserTerminalState.terminals.find((item) => item.id === terminalId);
    if (!terminal || terminal.status === "finished" || terminal.status === "failed") {
      return;
    }

    setBrowserTerminalStatus(terminalId, "detached");
    return;
  }

  await invoke<void>("detach_terminal", { terminalId });
}

export async function killTerminal(terminalId: string): Promise<void> {
  if (!isTauri()) {
    const terminal = browserTerminalState.terminals.find((item) => item.id === terminalId);
    if (!terminal || terminal.status === "finished" || terminal.status === "failed") {
      return;
    }

    appendBrowserTerminalOutput(terminalId, "\r\nLifecycle terminated this session.\r\n", "live");
    setBrowserTerminalStatus(terminalId, "finished", {
      endedAt: nowIso(),
      exitCode: 130,
    });
    return;
  }

  await invoke<void>("kill_terminal", { terminalId });
}

export async function subscribeToTerminalCreatedEvents(
  callback: (event: TerminalCreatedEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    browserListeners.created.add(callback);
    return () => {
      browserListeners.created.delete(callback);
    };
  }

  return listen<TerminalCreatedEvent>("terminal:created", (event) => {
    callback(event.payload);
  });
}

export async function subscribeToTerminalStatusEvents(
  callback: (event: TerminalStatusEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    browserListeners.status.add(callback);
    return () => {
      browserListeners.status.delete(callback);
    };
  }

  return listen<TerminalStatusEvent>("terminal:status-changed", (event) => {
    callback(event.payload);
  });
}

export async function subscribeToTerminalHarnessTurnCompletedEvents(
  callback: (event: TerminalHarnessTurnCompletedEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    browserListeners.harnessTurnCompleted.add(callback);
    return () => {
      browserListeners.harnessTurnCompleted.delete(callback);
    };
  }

  return listen<TerminalHarnessTurnCompletedEvent>("terminal:harness-turn-completed", (event) => {
    callback(event.payload);
  });
}

export async function subscribeToTerminalRemovedEvents(
  callback: (event: TerminalRemovedEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    browserListeners.removed.add(callback);
    return () => {
      browserListeners.removed.delete(callback);
    };
  }

  return listen<TerminalRemovedEvent>("terminal:removed", (event) => {
    callback(event.payload);
  });
}
