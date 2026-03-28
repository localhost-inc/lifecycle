import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { AgentSessionProviderId, WorkspaceHost } from "@lifecycle/contracts";
import type { AgentEvent } from "./events";
import {
  clearAgentSessionResponseReady as clearSharedAgentSessionResponseReady,
  clearAgentWorkspaceResponseReady as clearSharedAgentWorkspaceResponseReady,
  createAgentSessionStore,
  reduceAgentSessionEvent,
  selectAgentSessionResponseReady,
  selectAgentSessionRunning,
  selectAgentSessionState,
  selectAgentWorkspaceStatus,
  type AgentSessionState,
} from "./agent-session-store";
import {
  beginAgentPromptDispatch as beginSharedAgentPromptDispatch,
  clearAgentPromptQueue as clearSharedAgentPromptQueue,
  completeAgentPromptDispatch as completeSharedAgentPromptDispatch,
  createAgentPromptQueueStore,
  createAgentQueuedPrompt,
  dismissAgentPrompt as dismissSharedAgentPrompt,
  enqueueAgentPrompt as enqueueSharedAgentPrompt,
  failAgentPromptDispatch as failSharedAgentPromptDispatch,
  retryAgentPrompt as retrySharedAgentPrompt,
  selectAgentPromptQueueState,
  type AgentPromptQueueSessionState,
  type AgentQueuedPrompt,
} from "./prompt-queue-store";
import type { AgentInputPart } from "./turn";
import type { AgentClient } from "./client";
import type { AgentClientRegistry } from "./client-registry";
import type { AgentModelCatalog } from "./catalog";
import type { AgentAuthStatus } from "./providers/auth";
import type { AgentModelCatalogOptions } from "./worker";

const AgentClientRegistryContext = createContext<AgentClientRegistry | null>(null);
const AgentClientContext = createContext<AgentClient | null>(null);

type AgentAuthState = Record<string, AgentAuthStatus>;

const NOT_CHECKED: AgentAuthStatus = { state: "not_checked" };
let agentAuthState: AgentAuthState = import.meta.hot?.data.agentAuthState ?? {};
const agentAuthListeners: Set<() => void> =
  import.meta.hot?.data.agentAuthListeners ?? new Set<() => void>();

// Preserve agent session store state across Vite HMR so active sessions survive hot reloads.
let agentSessionStoreState: ReturnType<typeof createAgentSessionStore> =
  import.meta.hot?.data.agentSessionStoreState ?? createAgentSessionStore();
let agentPromptQueueStoreState: ReturnType<typeof createAgentPromptQueueStore> =
  import.meta.hot?.data.agentPromptQueueStoreState ?? createAgentPromptQueueStore();

const agentSessionListeners: Map<string, Set<() => void>> = import.meta.hot?.data
  .agentSessionListeners ?? new Map<string, Set<() => void>>();
const agentPromptQueueListeners: Map<string, Set<() => void>> = import.meta.hot?.data
  .agentPromptQueueListeners ?? new Map<string, Set<() => void>>();
const agentStoreListeners: Set<() => void> =
  import.meta.hot?.data.agentStoreListeners ?? new Set<() => void>();

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

function readAgentAuthStatus(
  workspaceHost: WorkspaceHost,
  provider: AgentSessionProviderId,
): AgentAuthStatus {
  return agentAuthState[getAgentAuthStateKey(workspaceHost, provider)] ?? NOT_CHECKED;
}

function emitAgentAuthChange(): void {
  for (const listener of agentAuthListeners) {
    listener();
  }
}

function setAgentAuthStatus(
  workspaceHost: WorkspaceHost,
  provider: AgentSessionProviderId,
  status: AgentAuthStatus,
): void {
  agentAuthState = {
    ...agentAuthState,
    [getAgentAuthStateKey(workspaceHost, provider)]: status,
  };
  emitAgentAuthChange();
}

function subscribeAgentAuth(listener: () => void): () => void {
  agentAuthListeners.add(listener);
  return () => {
    agentAuthListeners.delete(listener);
  };
}

export function AgentClientRegistryProvider({
  agentClientRegistry,
  children,
}: {
  agentClientRegistry: AgentClientRegistry;
  children: ReactNode;
}) {
  return createElement(
    AgentClientRegistryContext.Provider,
    { value: agentClientRegistry },
    children,
  );
}

export function AgentClientProvider({
  agentClient,
  children,
}: {
  agentClient: AgentClient;
  children: ReactNode;
}) {
  return createElement(AgentClientContext.Provider, { value: agentClient }, children);
}

export function useAgentClientRegistry(): AgentClientRegistry {
  const value = useContext(AgentClientRegistryContext);
  if (!value) {
    throw new Error("AgentClientRegistryProvider is required");
  }

  return value;
}

export function useAgentClient(): AgentClient {
  const agentClient = useContext(AgentClientContext);
  if (!agentClient) {
    throw new Error("AgentClientProvider is required");
  }

  return agentClient;
}

export function getAgentAuthSnapshot(): AgentAuthState {
  return agentAuthState;
}

export function resetAgentAuthStateForTests(): void {
  agentAuthState = {};
  agentAuthListeners.clear();
}

export function useAgentAuthStatus(provider: AgentSessionProviderId): AgentAuthStatus {
  const agentClient = useAgentClient();
  const workspaceHost = agentClient.workspaceHost;
  return useSyncExternalStore(
    subscribeAgentAuth,
    () => readAgentAuthStatus(workspaceHost, provider),
    () => readAgentAuthStatus(workspaceHost, provider),
  );
}

export function useAgentAuth(provider: AgentSessionProviderId): {
  check: () => Promise<AgentAuthStatus>;
  ensureAuthenticated: () => Promise<AgentAuthStatus>;
  login: () => Promise<AgentAuthStatus>;
  status: AgentAuthStatus;
} {
  const agentClient = useAgentClient();
  const workspaceHost = agentClient.workspaceHost;
  const status = useAgentAuthStatus(provider);

  const check = useCallback(async () => {
    setAgentAuthStatus(workspaceHost, provider, { state: "checking" });
    const nextStatus = await agentClient.checkAuth(provider);
    setAgentAuthStatus(workspaceHost, provider, nextStatus);
    return nextStatus;
  }, [agentClient, provider, workspaceHost]);

  const login = useCallback(async () => {
    setAgentAuthStatus(workspaceHost, provider, {
      state: "authenticating",
      output: [],
    });
    const nextStatus = await agentClient.login(provider, (statusUpdate) => {
      setAgentAuthStatus(workspaceHost, provider, statusUpdate);
    });
    setAgentAuthStatus(workspaceHost, provider, nextStatus);
    return nextStatus;
  }, [agentClient, provider, workspaceHost]);

  const ensureAuthenticated = useCallback(async () => {
    let currentStatus = readAgentAuthStatus(workspaceHost, provider);

    if (currentStatus.state === "not_checked" || currentStatus.state === "checking") {
      currentStatus = await check();
    }

    if (currentStatus.state === "unauthenticated") {
      currentStatus = await login();
    }

    return currentStatus;
  }, [check, login, provider, workspaceHost]);

  return {
    check,
    ensureAuthenticated,
    login,
    status,
  };
}

interface AgentModelCatalogState {
  catalog: AgentModelCatalog | null;
  error: Error | null;
  isLoading: boolean;
}

export function useAgentModelCatalog(
  provider: AgentSessionProviderId,
  options: AgentModelCatalogOptions,
): AgentModelCatalogState {
  const agentClient = useAgentClient();
  const enabled = options.enabled ?? true;
  const loginMethod = options.loginMethod;
  const preferredModel = options.preferredModel;
  const requestOptions = useMemo<AgentModelCatalogOptions>(
    () => ({
      enabled,
      ...(loginMethod ? { loginMethod } : {}),
      ...(preferredModel ? { preferredModel } : {}),
    }),
    [enabled, loginMethod, preferredModel],
  );
  const [state, setState] = useState<AgentModelCatalogState>({
    catalog: null,
    error: null,
    isLoading: enabled,
  });

  useEffect(() => {
    if (!enabled) {
      setState((current) => ({
        catalog: current.catalog,
        error: null,
        isLoading: false,
      }));
      return;
    }

    let active = true;

    setState((current) => ({
      catalog: current.catalog,
      error: null,
      isLoading: true,
    }));

    void agentClient
      .getModelCatalog(provider, requestOptions)
      .then((catalog) => {
        if (!active) {
          return;
        }

        setState({
          catalog,
          error: null,
          isLoading: false,
        });
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setState((current) => ({
          catalog: current.catalog,
          error: error instanceof Error ? error : new Error(String(error)),
          isLoading: false,
        }));
      });

    return () => {
      active = false;
    };
  }, [agentClient, enabled, provider, requestOptions]);

  return state;
}

function subscribeAgentStore(listener: () => void): () => void {
  agentStoreListeners.add(listener);
  return () => {
    agentStoreListeners.delete(listener);
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
  writeAgentSessionStore([sessionId], (state) =>
    clearSharedAgentSessionResponseReady(state, sessionId),
  );
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
    clearSharedAgentWorkspaceResponseReady(state, workspaceId),
  );
}

export function queueAgentPrompt(sessionId: string, input: AgentInputPart[]): string {
  const promptId = globalThis.crypto?.randomUUID?.() ?? `queued-prompt-${Date.now()}`;
  writeAgentPromptQueueStore([sessionId], (state) =>
    enqueueSharedAgentPrompt(state, {
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
    const result = beginSharedAgentPromptDispatch(state, { promptId, sessionId });
    claimedPrompt = result.prompt;
    return result.state;
  });
  return claimedPrompt;
}

export function completeAgentPromptDispatch(sessionId: string, promptId: string): void {
  writeAgentPromptQueueStore([sessionId], (state) =>
    completeSharedAgentPromptDispatch(state, { promptId, sessionId }),
  );
}

export function failAgentPromptDispatch(sessionId: string, promptId: string, error: string): void {
  writeAgentPromptQueueStore([sessionId], (state) =>
    failSharedAgentPromptDispatch(state, { error, promptId, sessionId }),
  );
}

export function retryAgentPrompt(sessionId: string, promptId: string): void {
  writeAgentPromptQueueStore([sessionId], (state) =>
    retrySharedAgentPrompt(state, { promptId, sessionId }),
  );
}

export function dismissAgentPrompt(sessionId: string, promptId: string): void {
  writeAgentPromptQueueStore([sessionId], (state) =>
    dismissSharedAgentPrompt(state, { promptId, sessionId }),
  );
}

export function clearAgentPromptQueue(sessionId: string): void {
  writeAgentPromptQueueStore([sessionId], (state) => clearSharedAgentPromptQueue(state, sessionId));
}

export function useAgentStatusIndex(): {
  clearAgentSessionResponseReady: (sessionId: string) => void;
  clearWorkspaceAgentResponseReady: (workspaceId: string) => void;
  hasWorkspaceResponseReady: (workspaceId: string) => boolean;
  hasWorkspaceRunningTurn: (workspaceId: string) => boolean;
  isAgentSessionResponseReady: (sessionId: string) => boolean;
  isAgentSessionRunning: (sessionId: string) => boolean;
} {
  useSyncExternalStore(
    subscribeAgentStore,
    () => agentSessionStoreState,
    () => agentSessionStoreState,
  );

  return {
    clearAgentSessionResponseReady,
    clearWorkspaceAgentResponseReady,
    hasWorkspaceResponseReady: (workspaceId: string) =>
      selectAgentWorkspaceStatus(agentSessionStoreState, workspaceId).responseReady,
    hasWorkspaceRunningTurn: (workspaceId: string) =>
      selectAgentWorkspaceStatus(agentSessionStoreState, workspaceId).running,
    isAgentSessionResponseReady: (sessionId: string) =>
      selectAgentSessionResponseReady(agentSessionStoreState, sessionId),
    isAgentSessionRunning: (sessionId: string) =>
      selectAgentSessionRunning(agentSessionStoreState, sessionId),
  };
}

export function useAgentSessionState(sessionId: string): AgentSessionState {
  return useSyncExternalStore(
    (listener: () => void) => {
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
    },
    () => selectAgentSessionState(agentSessionStoreState, sessionId),
    () => selectAgentSessionState(agentSessionStoreState, sessionId),
  );
}

export function useAgentPromptQueueState(sessionId: string): AgentPromptQueueSessionState {
  return useSyncExternalStore(
    (listener: () => void) => {
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
    },
    () => selectAgentPromptQueueState(agentPromptQueueStoreState, sessionId),
    () => selectAgentPromptQueueState(agentPromptQueueStoreState, sessionId),
  );
}

export function resetAgentSessionStoreForTests(): void {
  agentSessionStoreState = createAgentSessionStore();
  agentPromptQueueStoreState = createAgentPromptQueueStore();
  agentSessionListeners.clear();
  agentPromptQueueListeners.clear();
  agentStoreListeners.clear();
}
