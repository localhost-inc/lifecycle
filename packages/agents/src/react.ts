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
import type { AgentSessionProviderId } from "@lifecycle/contracts";
import type { AgentSessionState } from "./session/state";
import type { AgentPromptQueueSessionState } from "./session/prompt-queue";
import {
  clearAgentSessionResponseReady,
  clearWorkspaceAgentResponseReady,
  getAgentPromptQueueStateSnapshot,
  getAgentSessionStoreSnapshot,
  getAgentSessionStateSnapshot,
  getAgentStatusIndex,
  readAgentAuthStatus,
  setAgentAuthStatus,
  subscribeAgentAuth,
  subscribeAgentPromptQueue,
  subscribeAgentSession,
  subscribeAgentStore,
} from "./session/store";
import type { AgentClient } from "./client";
import type { AgentClientRegistry } from "./client-registry";
import type { AgentModelCatalog } from "./catalog";
import type { AgentAuthStatus } from "./providers/auth";
import type { AgentAuthOptions, AgentModelCatalogOptions } from "./worker";

const AgentClientRegistryContext = createContext<AgentClientRegistry | null>(null);
const AgentClientContext = createContext<AgentClient | null>(null);

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

export function useAgentAuthStatus(provider: AgentSessionProviderId): AgentAuthStatus {
  const agentClient = useAgentClient();
  const workspaceHost = agentClient.workspaceHost;
  return useSyncExternalStore(
    subscribeAgentAuth,
    () => readAgentAuthStatus(workspaceHost, provider),
    () => readAgentAuthStatus(workspaceHost, provider),
  );
}

export function useAgentAuth(
  provider: AgentSessionProviderId,
  options?: AgentAuthOptions,
): {
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
    const nextStatus = await agentClient.login(
      provider,
      (statusUpdate) => {
        setAgentAuthStatus(workspaceHost, provider, statusUpdate);
      },
      options,
    );
    setAgentAuthStatus(workspaceHost, provider, nextStatus);
    return nextStatus;
  }, [agentClient, options, provider, workspaceHost]);

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

export function useAgentStatusIndex(): {
  clearAgentSessionResponseReady: (sessionId: string) => void;
  clearWorkspaceAgentResponseReady: (workspaceId: string) => void;
  hasWorkspaceResponseReady: (workspaceId: string) => boolean;
  hasWorkspaceRunningTurn: (workspaceId: string) => boolean;
  isAgentSessionResponseReady: (sessionId: string) => boolean;
  isAgentSessionRunning: (sessionId: string) => boolean;
  /** The store snapshot — include in useMemo deps to invalidate when any session state changes. */
  storeVersion: unknown;
} {
  const storeVersion = useSyncExternalStore(
    subscribeAgentStore,
    getAgentSessionStoreSnapshot,
    getAgentSessionStoreSnapshot,
  );

  const index = getAgentStatusIndex();

  return {
    clearAgentSessionResponseReady,
    clearWorkspaceAgentResponseReady,
    hasWorkspaceResponseReady: index.hasWorkspaceResponseReady,
    hasWorkspaceRunningTurn: index.hasWorkspaceRunningTurn,
    isAgentSessionResponseReady: index.isAgentSessionResponseReady,
    isAgentSessionRunning: index.isAgentSessionRunning,
    storeVersion,
  };
}

export function useAgentSessionState(sessionId: string): AgentSessionState {
  return useSyncExternalStore(
    (listener: () => void) => subscribeAgentSession(sessionId, listener),
    () => getAgentSessionStateSnapshot(sessionId),
    () => getAgentSessionStateSnapshot(sessionId),
  );
}

export function useAgentPromptQueueState(sessionId: string): AgentPromptQueueSessionState {
  return useSyncExternalStore(
    (listener: () => void) => subscribeAgentPromptQueue(sessionId, listener),
    () => getAgentPromptQueueStateSnapshot(sessionId),
    () => getAgentPromptQueueStateSnapshot(sessionId),
  );
}
