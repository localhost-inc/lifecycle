import type { AgentMessageRole, AgentProviderId, AgentRecord } from "./agent";
import type {
  ServiceStatus,
  ServiceStatusReason,
  WorkspaceFailureReason,
  WorkspaceStatus,
} from "./workspace";

// ── Supporting types for agent event payloads ───────────────────────────────
// These are part of the event contract. Agent-internal types that don't appear
// in event payloads stay local to the surface that still uses them.

export type AgentImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

export type AgentMessagePart =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "status"; text: string }
  | { type: "image"; mediaType: AgentImageMediaType; base64Data: string }
  | { type: "attachment_ref"; attachmentId: string }
  | {
      type: "tool_call";
      toolCallId: string;
      toolName: string;
      inputJson?: string | undefined;
      outputJson?: string | null | undefined;
      status?: AgentToolCallStatus | null | undefined;
      errorText?: string | null | undefined;
    }
  | {
      type: "tool_result";
      toolCallId: string;
      outputJson?: string | null | undefined;
      errorText?: string | null | undefined;
    }
  | {
      type: "approval_ref";
      approvalId: string;
      decision?: AgentApprovalDecision | null | undefined;
      kind?: AgentApprovalKind | null | undefined;
      message?: string | null | undefined;
      metadata?: Record<string, unknown> | null | undefined;
      status?: AgentApprovalStatus | null | undefined;
    }
  | {
      type: "artifact_ref";
      artifactId: string;
      artifactType?: AgentArtifactType | null | undefined;
      title?: string | null | undefined;
      uri?: string | null | undefined;
    };

export type AgentToolCallStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentItemStatus = "running" | "completed" | "failed";

export type AgentItem =
  | {
      id: string;
      type: "agent_message";
      text: string;
      sourceType?: string | null;
      metadata?: Record<string, unknown> | null;
    }
  | {
      id: string;
      type: "reasoning";
      text: string;
      reasoningKind?: "reasoning" | "plan";
      sourceType?: string | null;
      metadata?: Record<string, unknown> | null;
    }
  | {
      id: string;
      type: "command_execution";
      command: string;
      output: string;
      exitCode?: number;
      status: AgentItemStatus;
      sourceType?: string | null;
      metadata?: Record<string, unknown> | null;
    }
  | {
      id: string;
      type: "file_change";
      changes: { path: string; kind: "add" | "delete" | "update"; diff?: string }[];
      diff?: string;
      status: AgentItemStatus;
      sourceType?: string | null;
      metadata?: Record<string, unknown> | null;
    }
  | {
      id: string;
      type: "tool_call";
      toolName: string;
      toolCallId: string;
      inputJson?: string | undefined;
      outputJson?: string | undefined;
      errorText?: string | undefined;
      status: AgentItemStatus;
      sourceType?: string | null;
      metadata?: Record<string, unknown> | null;
    }
  | {
      id: string;
      type: "image_view";
      path: string;
      sourceType?: string | null;
      metadata?: Record<string, unknown> | null;
    }
  | {
      id: string;
      type: "image_generation";
      result: string;
      revisedPrompt?: string | null;
      status?: string | null;
      sourceType?: string | null;
      metadata?: Record<string, unknown> | null;
    }
  | {
      id: string;
      type: "review_mode";
      mode: "entered" | "exited";
      review: string;
      sourceType?: string | null;
      metadata?: Record<string, unknown> | null;
    }
  | {
      id: string;
      type: "context_compaction";
      sourceType?: string | null;
      metadata?: Record<string, unknown> | null;
    }
  | {
      id: string;
      type: "error";
      message: string;
      sourceType?: string | null;
      metadata?: Record<string, unknown> | null;
    };

export type AgentItemDeltaKind =
  | "text"
  | "thinking"
  | "reasoning_summary"
  | "plan"
  | "command_output"
  | "file_diff"
  | "terminal_input"
  | "audio"
  | "other";

export interface AgentItemDelta {
  itemId: string;
  kind: AgentItemDeltaKind;
  text: string;
  index?: number | null;
  stream?: "stdout" | "stderr" | null;
  metadata?: Record<string, unknown> | null;
}

export type AgentProviderSignalChannel =
  | "account"
  | "apps"
  | "auth"
  | "config"
  | "hook"
  | "item"
  | "mcp"
  | "realtime"
  | "skills"
  | "system"
  | "task"
  | "thread"
  | "turn";

export interface AgentProviderSignal {
  channel: AgentProviderSignalChannel;
  name: string;
  itemId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type AgentProviderRequestKind =
  | "approval"
  | "apply_patch_approval"
  | "auth_refresh"
  | "command_approval"
  | "dynamic_tool_call"
  | "other"
  | "user_input";

export interface AgentProviderRequest {
  id: string;
  kind: AgentProviderRequestKind;
  title: string;
  itemId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type AgentProviderRequestOutcome =
  | "approved"
  | "cancelled"
  | "completed"
  | "failed"
  | "rejected"
  | "submitted";

export interface AgentProviderRequestResolution {
  requestId: string;
  outcome: AgentProviderRequestOutcome;
  response?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface AgentToolCallUpdate {
  id: string;
  agentId: string;
  toolName: string;
  status: AgentToolCallStatus;
  inputJson: Record<string, unknown>;
  outputJson?: Record<string, unknown> | null;
  errorText?: string | null;
}

export type AgentApprovalKind =
  | "tool"
  | "shell"
  | "network"
  | "file_write"
  | "file_delete"
  | "question"
  | "handoff";

export type AgentApprovalStatus =
  | "pending"
  | "approved_once"
  | "approved_session"
  | "rejected"
  | "expired";

export type AgentApprovalDecision = "approve_once" | "approve_session" | "reject";

export interface AgentApprovalRequest {
  id: string;
  agentId: string;
  kind: AgentApprovalKind;
  scopeKey: string;
  status: AgentApprovalStatus;
  message: string;
  metadata?: Record<string, unknown> | null;
}

export interface AgentApprovalResolution {
  approvalId: string;
  agentId: string;
  decision: AgentApprovalDecision;
  response?: Record<string, unknown> | null;
}

export type AgentArtifactType =
  | "diff"
  | "file"
  | "link"
  | "preview"
  | "note"
  | "report"
  | "command_output";

export interface AgentArtifactDescriptor {
  id: string;
  agentId: string;
  artifactType: AgentArtifactType;
  title: string;
  uri: string;
  metadataJson?: Record<string, unknown> | null;
}

export type AgentInputPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: AgentImageMediaType; base64Data: string }
  | { type: "attachment_ref"; attachmentId: string };

// ── Event taxonomy ──────────────────────────────────────────────────────────
// Every event in the system. The event is just the payload — envelope fields
// (id, occurredAt) are added at the persistence/transmission layer.

export type LifecycleEvent =
  // ── Workspace ──
  | {
      kind: "workspace.status.changed";
      workspaceId: string;
      status: WorkspaceStatus;
      failureReason: WorkspaceFailureReason | null;
      workspaceRoot?: string | null;
      gitSha?: string | null;
      manifestFingerprint?: string | null;
      failedAt?: string | null;
    }
  | {
      kind: "workspace.renamed";
      workspaceId: string;
      name: string;
      sourceRef: string;
      workspaceRoot: string | null;
    }
  | {
      kind: "workspace.archived";
      workspaceId: string;
    }
  | {
      kind: "workspace.file.changed";
      workspaceId: string;
      filePath: string;
    }

  // ── Service ──
  | {
      kind: "service.status.changed";
      workspaceId: string;
      name: string;
      status: ServiceStatus;
      statusReason: ServiceStatusReason | null;
      assignedPort?: number | null;
    }
  | {
      kind: "service.process.exited";
      workspaceId: string;
      name: string;
      exitCode: number | null;
    }
  | {
      kind: "service.log.line";
      workspaceId: string;
      name: string;
      stream: "stdout" | "stderr";
      line: string;
    }

  // ── Git ──
  | {
      kind: "git.status.changed";
      workspaceId: string;
      branch: string | null;
      headSha: string | null;
      upstream: string | null;
    }
  | {
      kind: "git.head.changed";
      workspaceId: string;
      branch: string | null;
      headSha: string | null;
      upstream: string | null;
      ahead: number | null;
      behind: number | null;
    }
  | {
      kind: "git.log.changed";
      workspaceId: string;
      branch: string | null;
      headSha: string | null;
    }

  // ── Agent lifecycle ──
  | {
      kind: "agent.created";
      workspaceId: string;
      agent: AgentRecord;
    }
  | {
      kind: "agent.updated";
      workspaceId: string;
      agent: AgentRecord;
    }

  // ── Agent turn lifecycle ──
  | {
      kind: "agent.turn.started";
      workspaceId: string;
      agentId: string;
      turnId: string;
    }
  | {
      kind: "agent.turn.completed";
      workspaceId: string;
      agentId: string;
      turnId: string;
      usage?: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number | undefined;
      } | undefined;
      costUsd?: number | undefined;
    }
  | {
      kind: "agent.turn.failed";
      workspaceId: string;
      agentId: string;
      turnId: string;
      error: string;
    }

  // ── Agent message streaming ──
  | {
      kind: "agent.message.created";
      workspaceId: string;
      agentId: string;
      messageId: string;
      role: AgentMessageRole;
      turnId: string | null;
    }
  | {
      kind: "agent.message.part.delta";
      workspaceId: string;
      agentId: string;
      messageId: string;
      partId: string;
      part: AgentMessagePart;
    }
  | {
      kind: "agent.message.part.completed";
      workspaceId: string;
      agentId: string;
      messageId: string;
      partId: string;
      part: AgentMessagePart;
    }

  // ── Agent tool calls ──
  | {
      kind: "agent.tool_call.updated";
      workspaceId: string;
      agentId: string;
      toolCall: AgentToolCallUpdate;
    }

  // ── Agent provider items ──
  | {
      kind: "agent.item.started";
      workspaceId: string;
      agentId: string;
      turnId: string;
      item: AgentItem;
    }
  | {
      kind: "agent.item.updated";
      workspaceId: string;
      agentId: string;
      turnId: string;
      item: AgentItem;
    }
  | {
      kind: "agent.item.completed";
      workspaceId: string;
      agentId: string;
      turnId: string;
      item: AgentItem;
    }
  | {
      kind: "agent.item.delta";
      workspaceId: string;
      agentId: string;
      turnId: string;
      delta: AgentItemDelta;
    }

  // ── Agent approvals ──
  | {
      kind: "agent.approval.requested";
      workspaceId: string;
      agentId: string;
      approval: AgentApprovalRequest;
    }
  | {
      kind: "agent.approval.resolved";
      workspaceId: string;
      agentId: string;
      resolution: AgentApprovalResolution;
    }

  // ── Agent artifacts ──
  | {
      kind: "agent.artifact.published";
      workspaceId: string;
      agentId: string;
      artifact: AgentArtifactDescriptor;
    }

  // ── Agent status ──
  | {
      kind: "agent.status.updated";
      workspaceId: string;
      agentId: string;
      status: string;
      detail?: string | null;
    }
  | {
      kind: "agent.auth.updated";
      workspaceId: string;
      agentId: string;
      provider: AgentProviderId;
      authenticated: boolean;
      mode?: string | null;
    }
  | {
      kind: "agent.provider.signal";
      workspaceId: string;
      agentId: string;
      turnId: string | null;
      signal: AgentProviderSignal;
    }
  | {
      kind: "agent.provider.requested";
      workspaceId: string;
      agentId: string;
      turnId: string | null;
      request: AgentProviderRequest;
    }
  | {
      kind: "agent.provider.request.resolved";
      workspaceId: string;
      agentId: string;
      turnId: string | null;
      resolution: AgentProviderRequestResolution;
    }

  // ── Agent provider passthrough ──
  | {
      kind: "agent.provider.event";
      workspaceId: string;
      agentId: string;
      turnId: string | null;
      eventType: string;
      payload: unknown;
    };

// ── Derived utility types ───────────────────────────────────────────────────

export type LifecycleEventKind = LifecycleEvent["kind"];

export type LifecycleEventOf<Kind extends LifecycleEventKind> = Extract<
  LifecycleEvent,
  { kind: Kind }
>;

/** Construct an event without envelope fields — used at the call site. */
export type LifecycleEventInput = {
  [Kind in LifecycleEventKind]: Omit<LifecycleEventOf<Kind>, never>;
}[LifecycleEventKind];

/** Event with persistence/transmission envelope. */
export type LifecycleEventEnvelope = LifecycleEvent & {
  id: string;
  occurredAt: string;
};
