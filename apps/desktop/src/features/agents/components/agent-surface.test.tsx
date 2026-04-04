import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AgentSessionState } from "@lifecycle/agents";
import { createContext, createElement, forwardRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const openTab = mock(() => {});
const sendTurn = mock(async () => {});
const cancelTurn = mock(async () => {});
const resolveApproval = mock(async () => {});
const setClaudeHarnessSettings = mock(() => {});
const setCodexHarnessSettings = mock(() => {});

const mockedSettingsValue = {
  harnesses: {
    claude: {
      effort: "default",
      loginMethod: "browser",
      model: "claude-sonnet-4-5",
      permissionMode: "acceptEdits",
    },
    codex: {
      model: "gpt-5-codex",
      reasoningEffort: "default",
      sandboxMode: "workspace-write",
    },
  },
  resolvedTheme: "dark" as const,
  setClaudeHarnessSettings,
  setCodexHarnessSettings,
};

mock.module("@/features/settings/state/settings-context", () => ({
  SettingsContext: createContext(mockedSettingsValue),
  useSettings: () => mockedSettingsValue,
}));

mock.module("@/features/agents/hooks", () => ({
  useAgentSession: () => ({
    id: "session_1",
    provider: "claude",
    status: "idle",
  }),
  useAgentSessionMessages: () => ({
    data: [],
    error: null,
  }),
}));

mock.module("@lifecycle/agents/react", () => ({
  useAgentClient: () => ({
    cancelTurn,
    resolveApproval,
    sendTurn,
  }),
  useAgentModelCatalog: () => ({
    catalog: { models: [] },
    error: null,
    isLoading: false,
  }),
  useAgentPromptQueueState: () => ({
    dispatchingPromptId: null,
    prompts: [],
  }),
  useAgentSessionState: (): AgentSessionState => ({
    authStatus: null,
    lastError: null,
    pendingApprovals: [],
    pendingTurnIds: [],
    providerStatus: null,
    responseReady: false,
    turnActivity: null,
    usage: {
      cacheReadTokens: 0,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
    },
    workspaceId: "workspace_1",
  }),
  useAgentStatusIndex: () => ({
    clearAgentSessionResponseReady: () => {},
    clearWorkspaceAgentResponseReady: () => {},
    hasWorkspaceResponseReady: () => false,
    hasWorkspaceRunningTurn: () => false,
    isAgentSessionResponseReady: () => false,
    isAgentSessionRunning: () => false,
    storeVersion: 0,
  }),
}));

mock.module("@/store/hooks", () => ({
  useRepositories: () => [],
  useRepository: () => undefined,
  useWorkspaces: () => [],
  useWorkspace: () => ({
    worktree_path: "/tmp/workspace_1",
  }),
  useWorkspacesByRepository: () => ({}),
  useWorkspaceServices: () => [],
  useAgentSessions: () => [],
  useAgentMessages: () => ({ data: [], error: null }),
  useAgentSessionRefresh: () => () => {},
}));

mock.module("@/features/workspaces/state/workspace-open-requests", () => ({
  WorkspaceOpenRequestsProvider: ({ children }: { children: React.ReactNode }) => children,
  useWorkspaceOpenRequests: () => ({
    clearTabRequest: () => {},
    openTab,
    requestsByWorkspaceId: {},
  }),
}));

mock.module("@/features/command-palette/use-command-palette-explorer", () => ({
  useCommandPaletteExplorer: () => ({
    items: [],
  }),
}));

mock.module("./use-agent-commands", () => ({
  useAgentCommands: () => [],
}));

mock.module("@/features/git/components/diff-render-provider", () => ({
  DiffRenderProvider: ({ children }: { children: React.ReactNode }) => children,
}));

mock.module("./agent-composer", () => ({
  AgentComposer: forwardRef(function AgentComposerMock(_, _ref) {
    return createElement("div", { "data-slot": "agent-composer" });
  }),
}));

beforeEach(() => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      removeItem(key: string) {
        storage.delete(key);
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
    },
  });
});

afterEach(() => {
  mock.clearAllMocks();
  Reflect.deleteProperty(globalThis, "sessionStorage");
});

describe("AgentSurface", () => {
  test("renders the idle composer without throwing during initial render", async () => {
    const { AgentSurface } = await import("./agent-surface");

    const markup = renderToStaticMarkup(
      createElement(AgentSurface, {
        agentSessionId: "session_1",
        paneFocused: true,
        workspaceId: "workspace_1",
      }),
    );

    expect(markup).toContain('data-slot="agent-composer"');
  });
});
