import type { AgentSessionProviderId, WorkspaceHost } from "@lifecycle/contracts";
import type { AgentEvent } from "../events";
import type { AgentAuthStatus } from "../providers/auth";
import type { AgentInputPart } from "../turn";
import {
  clearAgentSessionResponseReady as clearSessionResponseReadyState,
  clearAgentWorkspaceResponseReady as clearWorkspaceResponseReadyState,
  createAgentSessionStore,
  reduceAgentSessionEvent,
  selectAgentSessionResponseReady,
  selectAgentSessionRunning,
  selectAgentSessionState,
  selectAgentWorkspaceStatus,
} from "./state";
import {
  beginAgentPromptDispatch as beginPromptDispatchState,
  clearAgentPromptQueue as clearPromptQueueState,
  completeAgentPromptDispatch as completePromptDispatchState,
  createAgentPromptQueueStore,
  createAgentQueuedPrompt,
  dismissAgentPrompt as dismissPromptState,
  enqueueAgentPrompt as enqueuePromptState,
  failAgentPromptDispatch as failPromptDispatchState,
  retryAgentPrompt as retryPromptState,
  selectAgentPromptQueueState,
  type AgentPromptQueueSessionState,
  type AgentQueuedPrompt,
} from "./prompt-queue";

export type AgentAuthState = Record<string, AgentAuthStatus>;

interface AgentSessionStoreHotState {
  agentAuthListeners?: Set<() => void>;
  agentAuthState?: AgentAuthState;
  agentPromptQueueListeners?: Map<string, Set<() => void>>;
  agentPromptQueueStoreState?: ReturnType<typeof createAgentPromptQueueStore>;
  agentSessionListeners?: Map<string, Set<() => void>>;
  agentSessionStoreState?: ReturnType<typeof createAgentSessionStore>;
  agentStoreListeners?: Set<() => void>;
}

const hotData = import.meta.hot?.data as AgentSessionStoreHotState | undefined;

const NOT_CHECKED: AgentAuthStatus = { state: "not_checked" };

let agentAuthState: AgentAuthState = hotData?.agentAuthState ?? {};
const agentAuthListeners = hotData?.agentAuthListeners ?? new Set<() => void>();

let agentSessionStoreState = hotData?.agentSessionStoreState ?? createAgentSessionStore();
let agentPromptQueueStoreState =
  hotData?.agentPromptQueueStoreState ?? createAgentPromptQueueStore();

const agentSessionListeners = hotData?.agentSessionListeners ?? new Map<string, Set<() => void>>();
const agentPromptQueueListeners =
  hotData?.agentPromptQueueListeners ?? new Map<string, Set<() => void>>();
const agentStoreListeners = hotData?.agentStoreListeners ?? new Set<() => void>();

const agentStatusIndex = {
  hasWorkspaceResponseReady: (workspaceId: string) =>
    selectAgentWorkspaceStatus(agentSessionStoreState, workspaceId).responseReady,
  hasWorkspaceRunningTurn: (workspaceId: string) =>
    selectAgentWorkspaceStatus(agentSessionStoreState, workspaceId).running,
  isAgentSessionResponseReady: (sessionId: string) =>
    selectAgentSessionResponseReady(agentSessionStoreState, sessionId),
  isAgentSessionRunning: (sessionId: string) =>
    selectAgentSessionRunning(agentSessionStoreState, sessionId),
};

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => {
    data.agentAuthState = agentAuthState;
    data.agentAuthListeners = agentAuthListeners;
    data.agentSessionStoreState = agentSessionStoreState;
    data.agentPromptQueueStoreState = agentPromptQueueStoreState;
    data.agentSessionListeners = agentSessionListeners;
    data.agentPromptQueueListeners = agentPromptQueueListeners;
    data.agentStoreListeners = agentStoreListeners;
  });
}

function getAgentAuthStateKey(
  workspaceHost: WorkspaceHost,
  provider: AgentSessionProviderId,
): string {
  return `${workspaceHost}:${provider}`;
}

export function readAgentAuthStatus(
  workspaceHost: WorkspaceHost,
  provider: AgentSessionProviderId,
): AgentAuthStatus {
  return agentAuthState[getAgentAuthStateKey(workspaceHost, provider)] ?? NOT_CHECKED;
}

export function setAgentAuthStatus(
  workspaceHost: WorkspaceHost,
  provider: AgentSessionProviderId,
  status: AgentAuthStatus,
): void {
  agentAuthState = {
    ...agentAuthState,
    [getAgentAuthStateKey(workspaceHost, provider)]: status,
  };

  for (const listener of agentAuthListeners) {
    listener();
  }
}

export function subscribeAgentAuth(listener: () => void): () => void {
  agentAuthListeners.add(listener);
  return () => {
    agentAuthListeners.delete(listener);
  };
}

function emitAgentStoreChange(sessionIds: readonly string[]): void {
  for (const sessionId of sessionIds) {
    for (const listener of agentSessionListeners.get(sessionId) ?? []) {
      listener();
    }
  }

  for (const listener of agentStoreListeners) {
    listener();
  }
}

function writeAgentSessionStore(
  affectedSessionIds: readonly string[],
  updater: (state: typeof agentSessionStoreState) => typeof agentSessionStoreState,
): void {
  const nextState = updater(agentSessionStoreState);
  if (nextState === agentSessionStoreState) {
    return;
  }

  agentSessionStoreState = nextState;
  emitAgentStoreChange(affectedSessionIds);
}

function emitAgentPromptQueueChange(sessionIds: readonly string[]): void {
  for (const sessionId of sessionIds) {
    for (const listener of agentPromptQueueListeners.get(sessionId) ?? []) {
      listener();
    }
  }
}

function writeAgentPromptQueueStore(
  affectedSessionIds: readonly string[],
  updater: (state: typeof agentPromptQueueStoreState) => typeof agentPromptQueueStoreState,
): void {
  const nextState = updater(agentPromptQueueStoreState);
  if (nextState === agentPromptQueueStoreState) {
    return;
  }

  agentPromptQueueStoreState = nextState;
  emitAgentPromptQueueChange(affectedSessionIds);
}

export function recordAgentSessionEvent(event: AgentEvent): void {
  const affectedSessionIds =
    event.kind === "agent.session.created" || event.kind === "agent.session.updated"
      ? [event.session.id]
      : "sessionId" in event
        ? [event.sessionId]
        : [];

  if (affectedSessionIds.length === 0) {
    return;
  }

  writeAgentSessionStore(affectedSessionIds, (state) => reduceAgentSessionEvent(state, event));
}

export function clearAgentSessionResponseReady(sessionId: string): void {
  writeAgentSessionStore([sessionId], (state) => clearSessionResponseReadyState(state, sessionId));
}

export function clearWorkspaceAgentResponseReady(workspaceId: string): void {
  const affectedSessionIds = Object.entries(agentSessionStoreState.sessionsById)
    .filter(
      ([, sessionState]) => sessionState.workspaceId === workspaceId && sessionState.responseReady,
    )
    .map(([sessionId]) => sessionId);

  if (affectedSessionIds.length === 0) {
    return;
  }

  writeAgentSessionStore(affectedSessionIds, (state) =>
    clearWorkspaceResponseReadyState(state, workspaceId),
  );
}

export function queueAgentPrompt(sessionId: string, input: AgentInputPart[]): string {
  const promptId = globalThis.crypto?.randomUUID?.() ?? `queued-prompt-${Date.now()}`;
  writeAgentPromptQueueStore([sessionId], (state) =>
    enqueuePromptState(state, {
      prompt: createAgentQueuedPrompt({ id: promptId, input }),
      sessionId,
    }),
  );
  return promptId;
}

export function beginAgentPromptDispatch(
  sessionId: string,
  promptId: string,
): AgentQueuedPrompt | null {
  let claimedPrompt: AgentQueuedPrompt | null = null;
  writeAgentPromptQueueStore([sessionId], (state) => {
    const result = beginPromptDispatchState(state, { promptId, sessionId });
    claimedPrompt = result.prompt;
    return result.state;
  });
  return claimedPrompt;
}

export function completeAgentPromptDispatch(sessionId: string, promptId: string): void {
  writeAgentPromptQueueStore([sessionId], (state) =>
    completePromptDispatchState(state, { promptId, sessionId }),
  );
}

export function failAgentPromptDispatch(sessionId: string, promptId: string, error: string): void {
  writeAgentPromptQueueStore([sessionId], (state) =>
    failPromptDispatchState(state, { error, promptId, sessionId }),
  );
}

export function retryAgentPrompt(sessionId: string, promptId: string): void {
  writeAgentPromptQueueStore([sessionId], (state) =>
    retryPromptState(state, { promptId, sessionId }),
  );
}

export function dismissAgentPrompt(sessionId: string, promptId: string): void {
  writeAgentPromptQueueStore([sessionId], (state) =>
    dismissPromptState(state, { promptId, sessionId }),
  );
}

export function clearAgentPromptQueue(sessionId: string): void {
  writeAgentPromptQueueStore([sessionId], (state) => clearPromptQueueState(state, sessionId));
}

export function subscribeAgentStore(listener: () => void): () => void {
  agentStoreListeners.add(listener);
  return () => {
    agentStoreListeners.delete(listener);
  };
}

export function subscribeAgentSession(sessionId: string, listener: () => void): () => void {
  const listeners = agentSessionListeners.get(sessionId) ?? new Set<() => void>();
  listeners.add(listener);
  agentSessionListeners.set(sessionId, listeners);

  return () => {
    const nextListeners = agentSessionListeners.get(sessionId);
    if (!nextListeners) {
      return;
    }

    nextListeners.delete(listener);
    if (nextListeners.size === 0) {
      agentSessionListeners.delete(sessionId);
    }
  };
}

export function subscribeAgentPromptQueue(sessionId: string, listener: () => void): () => void {
  const listeners = agentPromptQueueListeners.get(sessionId) ?? new Set<() => void>();
  listeners.add(listener);
  agentPromptQueueListeners.set(sessionId, listeners);

  return () => {
    const nextListeners = agentPromptQueueListeners.get(sessionId);
    if (!nextListeners) {
      return;
    }

    nextListeners.delete(listener);
    if (nextListeners.size === 0) {
      agentPromptQueueListeners.delete(sessionId);
    }
  };
}

export function getAgentSessionStateSnapshot(sessionId: string) {
  return selectAgentSessionState(agentSessionStoreState, sessionId);
}

export function getAgentPromptQueueStateSnapshot(sessionId: string): AgentPromptQueueSessionState {
  return selectAgentPromptQueueState(agentPromptQueueStoreState, sessionId);
}

export function getAgentSessionStoreSnapshot() {
  return agentSessionStoreState;
}

export function getAgentStatusIndex() {
  return agentStatusIndex;
}

export function getAgentAuthSnapshot(): AgentAuthState {
  return agentAuthState;
}

export function resetAgentAuthStateForTests(): void {
  agentAuthState = {};
  agentAuthListeners.clear();
}

export function resetAgentSessionStoreForTests(): void {
  agentSessionStoreState = createAgentSessionStore();
  agentPromptQueueStoreState = createAgentPromptQueueStore();
  agentSessionListeners.clear();
  agentPromptQueueListeners.clear();
  agentStoreListeners.clear();
}
