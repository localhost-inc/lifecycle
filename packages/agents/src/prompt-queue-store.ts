import type { AgentSessionProviderId } from "@lifecycle/contracts";
import type { AgentInputPart } from "./turn";

export interface AgentPromptPreview {
  attachmentSummary: string | null;
  text: string;
}

export interface AgentQueuedPrompt {
  error: string | null;
  id: string;
  input: AgentInputPart[];
  preview: AgentPromptPreview;
}

export interface AgentPromptQueueSessionState {
  dispatchingPromptId: string | null;
  prompts: AgentQueuedPrompt[];
}

export interface AgentPromptQueueStore {
  sessionsById: Record<string, AgentPromptQueueSessionState>;
}

export interface AgentPromptDispatchDecision {
  reason?: "active_turn" | "awaiting_approval";
  type: "dispatch_turn" | "hold";
}

const DEFAULT_AGENT_PROMPT_QUEUE_SESSION_STATE: AgentPromptQueueSessionState = {
  dispatchingPromptId: null,
  prompts: [],
};

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function updateSessionPromptQueue(
  state: AgentPromptQueueStore,
  sessionId: string,
  updater: (sessionState: AgentPromptQueueSessionState) => AgentPromptQueueSessionState,
): AgentPromptQueueStore {
  const current = selectAgentPromptQueueState(state, sessionId);
  const next = updater(current);
  if (next === current) {
    return state;
  }

  if (next.dispatchingPromptId === null && next.prompts.length === 0) {
    if (!(sessionId in state.sessionsById)) {
      return state;
    }
    const sessionsById = { ...state.sessionsById };
    delete sessionsById[sessionId];
    return { sessionsById };
  }

  return {
    sessionsById: {
      ...state.sessionsById,
      [sessionId]: next,
    },
  };
}

export function createAgentPromptQueueStore(): AgentPromptQueueStore {
  return {
    sessionsById: {},
  };
}

export function selectAgentPromptQueueState(
  state: AgentPromptQueueStore,
  sessionId: string,
): AgentPromptQueueSessionState {
  return state.sessionsById[sessionId] ?? DEFAULT_AGENT_PROMPT_QUEUE_SESSION_STATE;
}

export function buildAgentPromptPreview(input: AgentInputPart[]): AgentPromptPreview {
  const text = input
    .flatMap((part) => (part.type === "text" ? [part.text.trim()] : []))
    .filter((value) => value.length > 0)
    .join("\n")
    .trim();
  const imageCount = input.filter((part) => part.type === "image").length;
  const attachmentCount = input.filter((part) => part.type === "attachment_ref").length;
  const attachments = [
    imageCount > 0 ? pluralize(imageCount, "image") : null,
    attachmentCount > 0 ? pluralize(attachmentCount, "attachment") : null,
  ].filter((value): value is string => value !== null);
  const attachmentSummary = attachments.length > 0 ? attachments.join(" · ") : null;

  if (text.length > 0) {
    return {
      attachmentSummary,
      text,
    };
  }

  return {
    attachmentSummary: null,
    text: attachmentSummary ?? "Queued prompt",
  };
}

export function createAgentQueuedPrompt(input: {
  id: string;
  input: AgentInputPart[];
}): AgentQueuedPrompt {
  return {
    error: null,
    id: input.id,
    input: input.input,
    preview: buildAgentPromptPreview(input.input),
  };
}

export function enqueueAgentPrompt(
  state: AgentPromptQueueStore,
  input: { prompt: AgentQueuedPrompt; sessionId: string },
): AgentPromptQueueStore {
  return updateSessionPromptQueue(state, input.sessionId, (sessionState) => ({
    ...sessionState,
    prompts: [...sessionState.prompts, input.prompt],
  }));
}

export function beginAgentPromptDispatch(
  state: AgentPromptQueueStore,
  input: { promptId: string; sessionId: string },
): { prompt: AgentQueuedPrompt | null; state: AgentPromptQueueStore } {
  const sessionState = selectAgentPromptQueueState(state, input.sessionId);
  if (sessionState.dispatchingPromptId !== null) {
    return { prompt: null, state };
  }

  const prompt = sessionState.prompts.find((entry) => entry.id === input.promptId) ?? null;
  if (!prompt) {
    return { prompt: null, state };
  }

  return {
    prompt,
    state: updateSessionPromptQueue(state, input.sessionId, (current) => ({
      ...current,
      dispatchingPromptId: input.promptId,
    })),
  };
}

export function completeAgentPromptDispatch(
  state: AgentPromptQueueStore,
  input: { promptId: string; sessionId: string },
): AgentPromptQueueStore {
  return updateSessionPromptQueue(state, input.sessionId, (sessionState) => ({
    dispatchingPromptId:
      sessionState.dispatchingPromptId === input.promptId ? null : sessionState.dispatchingPromptId,
    prompts: sessionState.prompts.filter((entry) => entry.id !== input.promptId),
  }));
}

export function failAgentPromptDispatch(
  state: AgentPromptQueueStore,
  input: { error: string; promptId: string; sessionId: string },
): AgentPromptQueueStore {
  return updateSessionPromptQueue(state, input.sessionId, (sessionState) => ({
    dispatchingPromptId:
      sessionState.dispatchingPromptId === input.promptId ? null : sessionState.dispatchingPromptId,
    prompts: sessionState.prompts.map((entry) =>
      entry.id === input.promptId ? { ...entry, error: input.error } : entry,
    ),
  }));
}

export function retryAgentPrompt(
  state: AgentPromptQueueStore,
  input: { promptId: string; sessionId: string },
): AgentPromptQueueStore {
  return updateSessionPromptQueue(state, input.sessionId, (sessionState) => ({
    ...sessionState,
    prompts: sessionState.prompts.map((entry) =>
      entry.id === input.promptId ? { ...entry, error: null } : entry,
    ),
  }));
}

export function dismissAgentPrompt(
  state: AgentPromptQueueStore,
  input: { promptId: string; sessionId: string },
): AgentPromptQueueStore {
  return updateSessionPromptQueue(state, input.sessionId, (sessionState) => ({
    dispatchingPromptId:
      sessionState.dispatchingPromptId === input.promptId ? null : sessionState.dispatchingPromptId,
    prompts: sessionState.prompts.filter((entry) => entry.id !== input.promptId),
  }));
}

export function clearAgentPromptQueue(
  state: AgentPromptQueueStore,
  sessionId: string,
): AgentPromptQueueStore {
  return updateSessionPromptQueue(state, sessionId, () => DEFAULT_AGENT_PROMPT_QUEUE_SESSION_STATE);
}

export function selectQueuedAgentPromptCount(
  state: AgentPromptQueueStore,
  sessionId: string,
): number {
  const sessionState = selectAgentPromptQueueState(state, sessionId);
  return Math.max(
    0,
    sessionState.prompts.length - (sessionState.dispatchingPromptId !== null ? 1 : 0),
  );
}

export function resolveAgentPromptDispatchDecision(input: {
  activeTurnId: string | null;
  hasPendingApprovals: boolean;
  provider: AgentSessionProviderId;
}): AgentPromptDispatchDecision {
  if (input.hasPendingApprovals) {
    return { reason: "awaiting_approval", type: "hold" };
  }

  if (input.activeTurnId) {
    // Codex can eventually steer into an active turn, but the current worker
    // transport only gives us fire-and-forget commands. Keep the submission
    // queued locally until we have an acknowledged steer path.
    return {
      reason: "active_turn",
      type: "hold",
    };
  }

  return { type: "dispatch_turn" };
}
