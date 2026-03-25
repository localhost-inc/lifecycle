import { Spinner } from "@lifecycle/ui";
import { ResponseReadyDot } from "@/components/response-ready-dot";
import { AgentSurface } from "@/features/agents/components/agent-surface";
import {
  createAgentOpenInput,
  createAgentSurfaceLaunchRequest,
} from "@/features/workspaces/canvas/workspace-canvas-requests";
import { ClaudeIcon, CodexIcon } from "@/features/workspaces/surfaces/surface-icons";
import { getWorkspaceSessionStatusState } from "@/features/workspaces/surfaces/workspace-session-status";
import { workspaceSurfaceTabIconName } from "@/features/workspaces/surfaces/workspace-surface-tab-icons";
import {
  getOptionalString,
  isRecord,
  isValidAgentSessionProvider,
} from "@/features/workspaces/surfaces/workspace-surface-persistence-utils";
import {
  agentTabKey,
  createAgentTab,
  type AgentTab,
} from "@/features/workspaces/surfaces/workspace-surface-tab-records";
import {
  areWorkspaceCanvasViewStatesEqual,
  defaultWorkspaceSurfaceTabStatus,
  type WorkspaceSurfaceDefinition,
} from "@/features/workspaces/surfaces/workspace-surface-types";
import { formatWorkspaceError } from "@/features/workspaces/lib/workspace-errors";

function defaultAgentLabel(provider: "claude" | "codex"): string {
  return provider === "claude" ? "Claude" : "Codex";
}

function buildAgentLeading(
  tab: Parameters<WorkspaceSurfaceDefinition<"agent">["buildTabPresentation"]>[0],
  status = defaultWorkspaceSurfaceTabStatus(),
) {
  const state = getWorkspaceSessionStatusState({
    responseReady: Boolean(status.needsAttention),
    running: Boolean(status.isRunning),
  });

  if (state === "loading") {
    return (
      <span
        aria-label="Generating response"
        className="flex h-5 w-5 shrink-0 items-center justify-center"
        role="img"
        title="Generating response"
      >
        <Spinner className="size-4 shrink-0 text-[var(--muted-foreground)]" />
      </span>
    );
  }

  return (
    <span
      className="relative flex h-5 w-5 shrink-0 items-center justify-center text-current"
      data-surface-tab-icon={workspaceSurfaceTabIconName(tab)}
    >
      {state === "ready" ? (
        <ResponseReadyDot />
      ) : tab.provider === "claude" ? (
        <ClaudeIcon size={14} />
      ) : (
        <CodexIcon size={14} />
      )}
    </span>
  );
}

export const agentSurfaceDefinition: WorkspaceSurfaceDefinition<"agent"> = {
  areActiveSurfacesEqual: (previous, next) =>
    previous.tab === next.tab &&
    previous.workspaceId === next.workspaceId &&
    areWorkspaceCanvasViewStatesEqual(previous.viewState, next.viewState),
  buildTabPresentation: (tab, status) => ({
    leading: buildAgentLeading(tab, status),
    title: tab.label,
  }),
  createTab: (options) =>
    createAgentTab({
      agentSessionId: options.agentSessionId,
      label: options.label,
      provider: options.provider,
    }),
  getTabKey: (options) => agentTabKey(options.agentSessionId),
  parsePersistedTab: parsePersistedAgentTab,
  launchSurface: async (request, context) => {
    const { provider } = request.options;

    context.setPendingLaunchActionKey(provider);
    context.setLaunchError(null);

    try {
      const session = await context.agentOrchestrator.createDraftSession({
        provider,
        workspaceId: context.workspaceId,
      });

      context.openSurface(
        createAgentOpenInput({
          agentSessionId: session.id,
          label: session.title.trim() || defaultAgentLabel(session.provider),
          provider: session.provider,
        }),
      );

      void context.agentOrchestrator.bootstrapSession(session.id).catch((bootstrapError) => {
        console.error("[workspace] agent bootstrap failed:", bootstrapError);
      });
    } catch (error) {
      context.setLaunchError(formatWorkspaceError(error, "Failed to open agent."));
    } finally {
      context.setPendingLaunchActionKey(null);
    }
  },
  listLaunchActions: (context) => [
    {
      disabled: context.pendingLaunchActionKey !== null,
      icon: <ClaudeIcon />,
      key: "claude",
      loading: context.pendingLaunchActionKey === "claude",
      request: createAgentSurfaceLaunchRequest("claude"),
      title: "Claude",
    },
    {
      disabled: context.pendingLaunchActionKey !== null,
      icon: <CodexIcon />,
      key: "codex",
      loading: context.pendingLaunchActionKey === "codex",
      request: createAgentSurfaceLaunchRequest("codex"),
      title: "Codex",
    },
  ],
  normalizeTab: (tab, context) => {
    const nextLabel = context.agentSessionTitleBySessionId.get(tab.agentSessionId) ?? tab.label;
    return nextLabel === tab.label
      ? tab
      : {
          ...tab,
          label: nextLabel,
        };
  },
  renderActiveSurface: (activeSurface, context) => (
    <div
      className="flex min-h-0 flex-1 flex-col transition-opacity duration-200 ease-in-out"
      style={{ opacity: context.surfaceOpacity }}
    >
      <AgentSurface
        agentSessionId={activeSurface.tab.agentSessionId}
        paneFocused={context.paneFocused}
        workspaceId={activeSurface.workspaceId}
      />
    </div>
  ),
  resolveActiveSurface: (tab, context) => ({
    kind: "agent",
    tab,
    viewState: context.viewStateByTabKey[tab.key] ?? null,
    workspaceId: context.workspaceId,
  }),
  resolveTabStatus: (tab, context) => ({
    isDirty: false,
    isRunning: context.isAgentSessionRunning(tab.agentSessionId),
    needsAttention: context.isAgentSessionResponseReady(tab.agentSessionId),
  }),
  serializeTab: serializeAgentTab,
};

export function parsePersistedAgentTab(value: unknown): AgentTab | null {
  if (!isRecord(value)) {
    return null;
  }

  const agentSessionId = getOptionalString(value, "agentSessionId");
  const label = getOptionalString(value, "label");
  const provider = value.provider;
  if (!agentSessionId || !label || !isValidAgentSessionProvider(provider)) {
    return null;
  }

  return createAgentTab({
    agentSessionId,
    label,
    provider,
  });
}

export function serializeAgentTab(tab: AgentTab): Record<string, unknown> {
  return {
    agentSessionId: tab.agentSessionId,
    kind: tab.kind,
    label: tab.label,
    provider: tab.provider,
  };
}
