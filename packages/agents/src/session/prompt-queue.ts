import type { AgentInputPart, AgentProviderId } from "@lifecycle/contracts";

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

export interface AgentPromptQueueState {
  dispatchingPromptId: string | null;
  prompts: AgentQueuedPrompt[];
}

export interface AgentPromptQueueStore {
  agentsById: Record<string, AgentPromptQueueState>;
}

export interface AgentPromptDispatchDecision {
  reason?: "active_turn" | "awaiting_approval";
  type: "dispatch_turn" | "hold";
}

const DEFAULT_AGENT_PROMPT_QUEUE_STATE: AgentPromptQueueState = {
  dispatchingPromptId: null,
  prompts: [],
};

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function updateAgentPromptQueue(
  state: AgentPromptQueueStore,
  agentId: string,
  updater: (agentState: AgentPromptQueueState) => AgentPromptQueueState,
): AgentPromptQueueStore {
  const current = selectAgentPromptQueueState(state, agentId);
  const next = updater(current);
  if (next === current) {
    return state;
  }

  if (next.dispatchingPromptId === null && next.prompts.length === 0) {
    if (!(agentId in state.agentsById)) {
      return state;
    }
    const agentsById = { ...state.agentsById };
    delete agentsById[agentId];
    return { agentsById };
  }

  return {
    agentsById: {
      ...state.agentsById,
      [agentId]: next,
    },
  };
}

export function createAgentPromptQueueStore(): AgentPromptQueueStore {
  return {
    agentsById: {},
  };
}

export function selectAgentPromptQueueState(
  state: AgentPromptQueueStore,
  agentId: string,
): AgentPromptQueueState {
  return state.agentsById[agentId] ?? DEFAULT_AGENT_PROMPT_QUEUE_STATE;
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
  input: { prompt: AgentQueuedPrompt; agentId: string },
): AgentPromptQueueStore {
  return updateAgentPromptQueue(state, input.agentId, (agentState) => ({
    ...agentState,
    prompts: [...agentState.prompts, input.prompt],
  }));
}

export function beginAgentPromptDispatch(
  state: AgentPromptQueueStore,
  input: { promptId: string; agentId: string },
): { prompt: AgentQueuedPrompt | null; state: AgentPromptQueueStore } {
  const agentState = selectAgentPromptQueueState(state, input.agentId);
  if (agentState.dispatchingPromptId !== null) {
    return { prompt: null, state };
  }

  const prompt = agentState.prompts.find((entry) => entry.id === input.promptId) ?? null;
  if (!prompt) {
    return { prompt: null, state };
  }

  return {
    prompt,
    state: updateAgentPromptQueue(state, input.agentId, (current) => ({
      ...current,
      dispatchingPromptId: input.promptId,
    })),
  };
}

export function completeAgentPromptDispatch(
  state: AgentPromptQueueStore,
  input: { promptId: string; agentId: string },
): AgentPromptQueueStore {
  return updateAgentPromptQueue(state, input.agentId, (agentState) => ({
    dispatchingPromptId:
      agentState.dispatchingPromptId === input.promptId ? null : agentState.dispatchingPromptId,
    prompts: agentState.prompts.filter((entry) => entry.id !== input.promptId),
  }));
}

export function failAgentPromptDispatch(
  state: AgentPromptQueueStore,
  input: { error: string; promptId: string; agentId: string },
): AgentPromptQueueStore {
  return updateAgentPromptQueue(state, input.agentId, (agentState) => ({
    dispatchingPromptId:
      agentState.dispatchingPromptId === input.promptId ? null : agentState.dispatchingPromptId,
    prompts: agentState.prompts.map((entry) =>
      entry.id === input.promptId ? { ...entry, error: input.error } : entry,
    ),
  }));
}

export function retryAgentPrompt(
  state: AgentPromptQueueStore,
  input: { promptId: string; agentId: string },
): AgentPromptQueueStore {
  return updateAgentPromptQueue(state, input.agentId, (agentState) => ({
    ...agentState,
    prompts: agentState.prompts.map((entry) =>
      entry.id === input.promptId ? { ...entry, error: null } : entry,
    ),
  }));
}

export function dismissAgentPrompt(
  state: AgentPromptQueueStore,
  input: { promptId: string; agentId: string },
): AgentPromptQueueStore {
  return updateAgentPromptQueue(state, input.agentId, (agentState) => ({
    dispatchingPromptId:
      agentState.dispatchingPromptId === input.promptId ? null : agentState.dispatchingPromptId,
    prompts: agentState.prompts.filter((entry) => entry.id !== input.promptId),
  }));
}

export function clearAgentPromptQueue(
  state: AgentPromptQueueStore,
  agentId: string,
): AgentPromptQueueStore {
  return updateAgentPromptQueue(state, agentId, () => DEFAULT_AGENT_PROMPT_QUEUE_STATE);
}

export function selectQueuedAgentPromptCount(
  state: AgentPromptQueueStore,
  agentId: string,
): number {
  const agentState = selectAgentPromptQueueState(state, agentId);
  return Math.max(
    0,
    agentState.prompts.length - (agentState.dispatchingPromptId !== null ? 1 : 0),
  );
}

export function resolveAgentPromptDispatchDecision(input: {
  activeTurnId: string | null;
  hasPendingApprovals: boolean;
  provider: AgentProviderId;
}): AgentPromptDispatchDecision {
  if (input.hasPendingApprovals) {
    return { reason: "awaiting_approval", type: "hold" };
  }

  if (input.activeTurnId) {
    // Codex can eventually steer into an active turn, but the current
    // transport only gives us fire-and-forget commands. Keep the submission
    // queued locally until we have an acknowledged steer path.
    return {
      reason: "active_turn",
      type: "hold",
    };
  }

  return { type: "dispatch_turn" };
}
